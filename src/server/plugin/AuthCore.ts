import { type Auth, buildUser, isAESLegacy, verifyJWTPayload } from "@verdaccio/auth";
import { createRemoteUser, defaultLoggedUserRoles, defaultNonLoggedUserRoles } from "@verdaccio/config";
import type { JWTSignOptions, RemoteUser, Security } from "@verdaccio/types";

import type { ConfigHolder } from "@/server/config/Config";
import { ERRORS } from "@/server/constants";
import { debug } from "@/server/debugger";

import type { AuthProvider, OpenIDToken } from "./AuthProvider";
import {
  base64Decode,
  base64Encode,
  getAllConfiguredGroups,
  getAuthenticatedGroups,
  isNowBefore,
  signHmac,
  verifyHmac,
} from "./utils";

interface UserPayload {
  /** Subject of the provider token */
  sub?: string;
  /** User Name */
  n: string;
  /** Frozen groups, not re-read from the provider */
  g: string[];
  /** Expiration time, as seconds since the epoch */
  exp: number;
}

interface AccessTokenPayload {
  /** Subject of the provider token */
  sub?: string;
  /** Provider access token */
  at: string;
}

type LegacyPayload = UserPayload | AccessTokenPayload;

/** The user a verified token stands for. */
export type VerifiedUser = Omit<RemoteUser, "groups">;

function isAccessTokenPayload(u: LegacyPayload): u is AccessTokenPayload {
  return "at" in u;
}

export class AuthCore {
  private readonly provider: AuthProvider;

  private readonly configSecret: string;

  /** Whether npm tokens are AES legacy tokens rather than JWTs. */
  public readonly isLegacySecurity: boolean;

  private readonly security: Security;

  private readonly groupUsers: Record<string, string[]> | undefined;

  private readonly configuredGroups: string[];

  private readonly authenticatedGroups: string[] | boolean;

  private auth?: Auth;

  constructor(config: ConfigHolder, provider: AuthProvider) {
    this.provider = provider;

    this.configSecret = config.secret;
    this.security = config.security;
    this.isLegacySecurity = isAESLegacy(config.security);
    this.groupUsers = config.groupUsers;

    this.configuredGroups = getAllConfiguredGroups(config.packages);
    this.authenticatedGroups = getAuthenticatedGroups(config.authorizedGroups);
  }

  setAuth(auth: Auth) {
    this.auth = auth;
  }

  private get secret(): string {
    return this.auth?.secret ?? this.configSecret;
  }

  /**
   * Return the groups the user carries plus the roles Verdaccio gives every logged-in user.
   */
  getLoggedUserGroups(user: RemoteUser): string[] {
    return [...user.real_groups, ...defaultLoggedUserRoles];
  }

  /** Return the roles Verdaccio gives visitors who are not logged in. */
  getNonLoggedUserGroups(): string[] {
    return [...defaultNonLoggedUserRoles];
  }

  /**
   * Return the groups a username is mapped to by `group-users`.
   *
   * @param username the user to look up
   * @returns the matching groups, or undefined when `group-users` is not set
   */
  getUserGroups(username: string): string[] | undefined {
    if (!this.groupUsers) return undefined;

    const groupUsers = this.groupUsers;

    return Object.keys(groupUsers).filter((group) => {
      return groupUsers[group].includes(username);
    });
  }

  /** Keep the groups that are configured, add the username itself, and drop duplicates. */
  filterRealGroups(username: string, groups: string[] = []): string[] {
    const authenticatedGroups = typeof this.authenticatedGroups === "boolean" ? [] : this.authenticatedGroups;

    const relevantGroups = groups.filter(
      (group) => this.configuredGroups.includes(group) || authenticatedGroups.includes(group),
    );

    relevantGroups.push(username);

    return [...new Set(relevantGroups)].toReversed();
  }

  /**
   * Check whether the user is allowed to access the registry, given `authorized-groups`.
   *
   * @param username the user to check
   * @param groups the groups the user belongs to
   * @returns whether access is granted
   */
  authenticate(username: string, groups: string[] = []): boolean {
    if (!username) return false;

    debug("authenticate user %s with groups %j, required groups: %j", username, groups, this.authenticatedGroups);

    let isAuthenticated: boolean;

    /**
     * - if authenticatedGroups is true, the user must be in at least one group
     * - if authenticatedGroups is false, no group authentication is required
     */
    if (this.authenticatedGroups === true) {
      isAuthenticated = groups.length > 0;
    } else if (this.authenticatedGroups === false) {
      isAuthenticated = true;
    } else {
      /**
       * if authenticatedGroups is an array, the user must be in one of the groups
       */
      isAuthenticated = this.authenticatedGroups.some((group) => username === group || groups.includes(group));
    }

    return isAuthenticated;
  }

  /**
   * Issue the npm token, which is an AES legacy token or a JWT, depending on the registry.
   *
   * @param username the user to issue the token for
   * @param realGroups the groups to freeze in it
   * @param providerToken the provider token it has to stay valid with
   * @returns the token
   */
  async issueNpmToken(username: string, realGroups: string[], providerToken: OpenIDToken): Promise<string> {
    if (this.isLegacySecurity) {
      debug("using legacy encryption for npm token");

      const npmToken = this.legacyEncrypt(username, realGroups, providerToken);
      if (!npmToken) {
        throw new Error(ERRORS.TOKEN_ENCRYPTION_FAILED_NPM);
      }

      return npmToken;
    }
    return this.signJWT(username, realGroups, this.security.api.jwt!.sign);
  }

  /**
   * Verify an AES legacy npm token.
   *
   * JWT npm tokens are verified by Verdaccio itself and never reach this method.
   *
   * @param token the token from the Authorization header, or the password of a legacy login
   * @returns the user the token stands for, or false when the token is expired, belongs to
   * another subject, or is no longer authorized
   * @throws {TypeError} when the payload is not one this plugin signed
   */
  async verifyLegacyToken(token: string): Promise<VerifiedUser | false> {
    const payload = this.legacyDecode(token);

    let name: string;
    let userGroups: string[];
    let realGroups: string[];

    if (isAccessTokenPayload(payload)) {
      const info = await this.provider.getUserinfo(payload.at);

      // A recreated account keeps the username but gets a new subject. Only a provider that
      // reports one can be compared against, so a userinfo endpoint without `sub` is skipped.
      if (payload.sub) {
        if (!info.subject) {
          debug("provider returned no subject, the subject of the token is not checked");
        } else if (payload.sub !== info.subject) {
          debug("token subject %s does not match provider subject %s", payload.sub, info.subject);

          return false;
        }
      }

      name = info.name;
      userGroups = info.groups ?? [];
      realGroups = this.filterRealGroups(name, userGroups);
    } else if (!isNowBefore(payload.exp)) {
      return false;
    } else {
      name = payload.n;
      userGroups = [...payload.g];
      // The groups were filtered when the token was issued.
      realGroups = [...payload.g];
    }

    return this.authenticate(name, userGroups) ? { name, real_groups: realGroups } : false;
  }

  /**
   * Issue the UI token. Verdaccio only accepts a JWT token for the web UI.
   *
   * @param username the user to issue the token for
   * @param realGroups the groups to embed
   * @returns the signed token
   */
  issueUiToken(username: string, realGroups: string[]): Promise<string> {
    const jwtSignOptions = this.security.web.sign;

    return this.signJWT(username, realGroups, jwtSignOptions);
  }

  /**
   * Verify the UI token issued by this plugin.
   *
   * @param token the token from the request
   * @returns the user the token stands for
   */
  verifyUiToken(token: string): RemoteUser {
    return this.verifyJWT(token);
  }

  private signJWT(username: string, realGroups: string[], jwtSignOptions: JWTSignOptions): Promise<string> {
    if (!this.auth) {
      throw new ReferenceError(ERRORS.AUTH_NOT_INITIALIZED);
    }

    const remoteUser = createRemoteUser(username, realGroups);

    return this.auth.jwtEncrypt(remoteUser, jwtSignOptions);
  }

  private verifyJWT(token: string): RemoteUser {
    return verifyJWTPayload(token, this.secret, this.security);
  }

  private legacyEncrypt(username: string, realGroups: string[], providerToken: OpenIDToken): string {
    if (!this.auth) {
      throw new ReferenceError(ERRORS.AUTH_NOT_INITIALIZED);
    }

    // A legacy token does not have an expiration time of its own: we use the provider
    // expiration, or the access token, to tell whether the token is still valid.
    const expiresAt = typeof providerToken === "string" ? undefined : providerToken.expiresAt;
    const subject = typeof providerToken === "string" ? undefined : providerToken.subject;

    const payloadToken = this.legacyEncode(
      expiresAt
        ? { sub: subject, n: username, g: [...realGroups], exp: expiresAt }
        : {
            sub: subject,
            at: typeof providerToken === "string" ? providerToken : providerToken.accessToken,
          },
    );

    const token = this.auth.aesEncrypt(buildUser(username, payloadToken));

    if (!token) {
      throw new Error(ERRORS.TOKEN_ENCRYPTION_FAILED);
    }

    // Verdaccio 5 returns a Buffer here, which has to be encoded to a string.
    return typeof token === "string" ? token : base64Encode(token);
  }

  /**
   * Sign and encode the legacy payload.
   *
   * The payload has to prove it was issued by this plugin, so it carries a
   * signature made with the registry secret.
   *
   * @param payload the data to encode
   * @returns `<payload>.<signature>`
   */
  private legacyEncode(payload: LegacyPayload): string {
    const encoded = base64Encode(JSON.stringify(payload));

    return `${encoded}.${signHmac(encoded, this.secret)}`;
  }

  /**
   * Verify the signature of a legacy payload and decode it.
   *
   * @param payloadToken the signed payload
   * @returns the decoded payload
   * @throws {TypeError} when the signature or the payload shape is invalid
   */
  private legacyDecode(payloadToken: string): LegacyPayload {
    const [encoded, signature, ...rest] = payloadToken.split(".");

    if (!encoded || !signature || rest.length) {
      throw new TypeError(ERRORS.INVALID_TOKEN);
    }

    if (!verifyHmac(encoded, signature, this.secret)) {
      throw new TypeError(ERRORS.INVALID_TOKEN);
    }

    let payload: unknown;

    try {
      payload = JSON.parse(base64Decode(encoded));
    } catch {
      throw new TypeError(ERRORS.INVALID_TOKEN);
    }

    return this.assertLegacyPayload(payload);
  }

  /**
   * Check that a decoded payload has the fields the rest of the code reads.
   *
   * The signature is what proves the origin; this only rejects a payload of another shape.
   *
   * @throws {TypeError} when the payload does not have the expected shape
   */
  private assertLegacyPayload(payload: unknown): LegacyPayload {
    // Only the fields below are read, so any other shape falls through to the rejection.
    const { sub, at, n, g, exp } = (payload ?? {}) as Partial<AccessTokenPayload & UserPayload>;
    const subject = typeof sub === "string" ? sub : undefined;

    if (typeof at === "string" && at) {
      return { at, sub: subject };
    }

    if (
      typeof n === "string" &&
      n &&
      typeof exp === "number" &&
      Array.isArray(g) &&
      g.every((group) => typeof group === "string")
    ) {
      return { n, g, exp, sub: subject };
    }

    throw new TypeError(ERRORS.INVALID_TOKEN);
  }
}
