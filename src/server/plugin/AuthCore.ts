import { type Auth, buildUser, isAESLegacy, verifyJWTPayload } from "@verdaccio/auth";
import { defaultLoggedUserRoles, defaultNonLoggedUserRoles } from "@verdaccio/config";
import type { JWTSignOptions, PackageList, RemoteUser, Security } from "@verdaccio/types";

import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";

import type { AuthProvider, OpenIDToken } from "./AuthProvider";
import { base64Decode, base64Encode, isNowBefore } from "./utils";

export interface User {
  name?: string;
  realGroups: string[];
}

interface UserPayload {
  sub?: string;
  /** User Name */
  n: string;
  /** User Groups */
  g: string[];
  /** Expiration Time */
  exp: number;
}
interface AccessTokenPayload {
  sub?: string;
  /** Access Token */
  at: string;
}

type LegacyPayload = UserPayload | AccessTokenPayload;

function isAccessTokenPayload(u: LegacyPayload): u is AccessTokenPayload {
  return !!(u as AccessTokenPayload).at;
}

export class AuthCore {
  private readonly provider: AuthProvider;

  private readonly configSecret: string;

  private readonly security: Security;

  private readonly groupUsers: Record<string, string[]> | undefined;

  private readonly configuredGroups: string[];

  private readonly authenticatedGroups: string[] | boolean;

  private auth?: Auth;

  constructor(config: ConfigHolder, provider: AuthProvider) {
    this.provider = provider;

    this.configSecret = config.secret;
    this.security = config.security;
    this.groupUsers = config.groupUsers;

    this.configuredGroups = this.initConfiguredGroups(config.packages);
    this.authenticatedGroups = this.initAuthenticatedGroups(config.authorizedGroups);
  }

  setAuth(auth: Auth) {
    this.auth = auth;
  }

  private get secret(): string {
    return this.auth ? this.auth.secret : this.configSecret;
  }

  private initAuthenticatedGroups(val: unknown): string[] | boolean {
    switch (typeof val) {
      case "boolean": {
        return val;
      }
      case "string": {
        return [val].filter(Boolean);
      }
      case "object": {
        return Array.isArray(val) ? val.filter(Boolean) : false;
      }
      default: {
        return false;
      }
    }
  }

  /**
   * Returns all permission groups used in the Verdacio config.
   */
  private initConfiguredGroups(packages: PackageList = {}): string[] {
    for (const packageConfig of Object.values(packages)) {
      const groups = (["access", "publish", "unpublish"] as const)
        .flatMap((key) => packageConfig[key])
        .filter(Boolean) as string[];

      return [...new Set(groups)];
    }

    return [];
  }

  /**
   * Get the logged user's full groups
   *
   * Our JWT do not contain the user's full groups, so we need to get them from the config.
   *
   * @param user
   * @returns
   */
  getLoggedUserGroups(user: RemoteUser): string[] {
    return [...user.real_groups, ...defaultLoggedUserRoles];
  }

  /**
   * Get the non-logged user's full groups
   *
   * @param user
   * @returns
   */
  getNonLoggedUserGroups(user: RemoteUser): string[] {
    return [...user.real_groups, ...defaultNonLoggedUserRoles];
  }

  /**
   * Get the user groups from the config
   *
   * @param username
   * @returns groups or undefined
   */
  getUserGroups(username: string): string[] | undefined {
    if (!this.groupUsers) return undefined;

    const groupUsers = { ...this.groupUsers };

    return Object.keys(groupUsers).filter((group) => {
      return groupUsers[group].includes(username);
    });
  }

  // get unique and sorted groups
  filterRealGroups(username: string, groups: string[] = []): string[] {
    const authenticatedGroups = typeof this.authenticatedGroups === "boolean" ? [] : this.authenticatedGroups;

    const relevantGroups = groups.filter(
      (group) => this.configuredGroups.includes(group) || authenticatedGroups.includes(group),
    );

    /**
     * add the user to the groups
     */
    relevantGroups.push(username);

    return relevantGroups.filter((value, index, self) => self.indexOf(value) === index).sort();
  }

  /**
   * Check if the user is allowed to access the registry
   *
   * @param username
   * @param groups
   * @returns true if the user is allowed to access the registry
   */
  authenticate(username: string, groups: string[] = []): boolean {
    if (!username) return false;

    debug("authenticate user %s with groups %j, required groups: %j", username, groups, this.authenticatedGroups);

    let authenticated: boolean;

    /**
     * - if authenticatedGroups is true, the user must be in at least one group
     * - if authenticatedGroups is false, no group authentication is required
     */
    if (this.authenticatedGroups === true) {
      authenticated = groups.length > 0;
    } else if (this.authenticatedGroups === false) {
      authenticated = true;
    } else {
      /**
       * if authenticatedGroups is an array, the user must be in one of the groups
       */
      authenticated = this.authenticatedGroups.some((group) => username === group || groups.includes(group));
    }

    return authenticated;
  }

  issueNpmToken(username: string, realGroups: string[], providerToken: OpenIDToken): Promise<string> {
    if (isAESLegacy(this.security)) {
      debug("using legacy encryption for npm token");

      const npmToken = this.legacyEncrypt(username, realGroups, providerToken);
      if (!npmToken) {
        throw new Error("Internal server error, failed to encrypt npm token");
      }

      return Promise.resolve(npmToken);
    } else {
      return this.signJWT(username, realGroups, this.security.api.jwt!.sign);
    }
  }

  /**
   * Verify the npm token
   *
   * @param token
   * @returns
   */
  async verifyNpmToken(token: string): Promise<User | false> {
    // if jwt is not enabled, use legacy encryption
    // the token is the password in basic auth
    // decode it and get the token from the payload
    if (isAESLegacy(this.security)) {
      debug("verifying npm token using legacy encryption");

      const legacyPayload = this.legacyDecode(token);

      debug("legacy payload: %j", legacyPayload);

      if (isAccessTokenPayload(legacyPayload)) {
        const { at } = legacyPayload;

        const { name, groups } = await this.provider.getUserinfo(at);
        if (!this.authenticate(name, groups)) {
          return false;
        }

        return { name: name, realGroups: this.filterRealGroups(name, groups) };
      } else {
        if (!isNowBefore(legacyPayload.exp)) {
          return false;
        }

        return { name: legacyPayload.n, realGroups: legacyPayload.g };
      }
    } else {
      return this.verifyJWT(token);
    }
  }

  // The ui token of verdaccio is always a JWT token.
  issueUiToken(username: string, realGroups: string[]): Promise<string> {
    const jwtSignOptions = this.security.web.sign;

    return this.signJWT(username, realGroups, jwtSignOptions);
  }

  verifyUiToken(token: string): User {
    return this.verifyJWT(token);
  }

  private signJWT(username: string, realGroups: string[], jwtSignOptions: JWTSignOptions): Promise<string> {
    if (!this.auth) {
      throw new ReferenceError("Unexpected error, auth is not initialized");
    }

    // providerToken is not needed in the token, we use jwt to check the expiration
    // remove groups from the user, so that the token is smaller
    const remoteUser: RemoteUser = {
      name: username,
      real_groups: [...realGroups],
      groups: [],
    };
    return this.auth.jwtEncrypt(remoteUser, jwtSignOptions);
  }

  private verifyJWT(token: string): User {
    // verifyPayload
    // use internal function to avoid error handling
    const remoteUser = verifyJWTPayload(token, this.secret);

    return {
      name: remoteUser.name as string | undefined,
      realGroups: [...remoteUser.real_groups],
    };
  }

  private legacyEncrypt(username: string, realGroups: string[], providerToken: OpenIDToken): string {
    if (!this.auth) {
      throw new ReferenceError("Unexpected error, auth is not initialized");
    }

    // encode the user info as a token, save it to the final token.
    let u: LegacyPayload;

    if (typeof providerToken === "string") {
      u = {
        at: providerToken,
      };
    } else {
      // legacy token does not have a expiration time
      // we use the provider expire time or token to check if the token is still valid
      u = providerToken.expiresAt
        ? {
            sub: providerToken.subject,
            n: username,
            g: [...realGroups],
            exp: providerToken.expiresAt,
          }
        : {
            sub: providerToken.subject,
            at: providerToken.accessToken,
          };
    }
    const payloadToken = this.legacyEncode(u);

    // use internal function to encrypt token
    const token = this.auth.aesEncrypt(buildUser(username, payloadToken));

    if (!token) {
      throw new Error("Internal server error, failed to encrypt token");
    }

    // the return value in verdaccio 5 is a buffer, we need to convert it to a string
    return typeof token === "string" ? token : base64Encode(token);
  }

  private legacyEncode(payload: LegacyPayload): string {
    return base64Encode(JSON.stringify(payload));
  }

  private legacyDecode(payloadToken: string): LegacyPayload {
    return JSON.parse(base64Decode(payloadToken)) as LegacyPayload;
  }
}
