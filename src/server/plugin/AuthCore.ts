import { Auth, buildUser, isAESLegacy } from "@verdaccio/auth";
import { createAnonymousRemoteUser, createRemoteUser } from "@verdaccio/config";
import { aesDecrypt, aesEncrypt, parseBasicPayload, signPayload, verifyPayload } from "@verdaccio/signature";
import type { JWTSignOptions, RemoteUser, Security } from "@verdaccio/types";

import logger from "../logger";
import { AuthProvider } from "./AuthProvider";
import { ParsedPluginConfig } from "./Config";

export type User = Omit<RemoteUser, "groups"> & {
  token?: string;
};

export class AuthCore {
  private readonly security: Security;

  private auth?: Auth;

  private readonly configuredGroups: Record<string, true>;

  constructor(private readonly parsedConfig: ParsedPluginConfig, private readonly provider: AuthProvider) {
    this.security = this.parsedConfig.security;

    this.configuredGroups = this.getConfiguredGroups();
  }

  setAuth(auth: Auth) {
    this.auth = auth;
  }

  private get secret(): string {
    return this.auth ? this.auth.secret : this.parsedConfig.secret;
  }

  /**
   * Returns all permission groups used in the Verdacio config.
   */
  getConfiguredGroups() {
    const configuredGroups: Record<string, true> = {};
    Object.values(this.parsedConfig.packages || {}).forEach((packageConfig) => {
      ["access", "publish", "unpublish"]
        .flatMap((key) => packageConfig[key])
        .filter(Boolean)
        .forEach((group: string) => {
          configuredGroups[group] = true;
        });
    });
    return configuredGroups;
  }

  private get requiredGroup(): string | null {
    return this.parsedConfig.authorizedGroup ? this.parsedConfig.authorizedGroup : null;
  }

  /**
   * Get the user groups from the config
   *
   * @param username
   * @returns groups or undefined
   */
  getUserGroups(username: string): string[] | undefined {
    let groupUsers;
    if ((groupUsers = this.parsedConfig.groupUsers)) {
      return Object.keys(groupUsers).filter((group) => {
        return groupUsers[group].includes(username);
      });
    }
  }

  // get unique and sorted groups
  filterRealGroups(username: string, groups: string[]): string[] {
    const relevantGroups = groups.filter((group) => group in this.configuredGroups);

    relevantGroups.push(username);

    // put required group at the end
    if (this.requiredGroup) {
      relevantGroups.push(this.requiredGroup);
    }

    return relevantGroups.filter((val, index, self) => self.indexOf(val) === index).sort();
  }

  createAuthenticatedUser(username: string, realGroups: string[]): RemoteUser {
    return createRemoteUser(username, realGroups);
  }

  createAnonymousUser(): RemoteUser {
    return createAnonymousRemoteUser();
  }

  /**
   * Check if the user is allowed to access the registry
   *
   * @param username
   * @param groups
   * @returns true if the user is allowed to access the registry
   */
  authenticate(username: string | void, groups: string[] = []): boolean {
    if (!username) return false;

    if (this.requiredGroup) {
      if (username !== this.requiredGroup && !groups.includes(this.requiredGroup)) {
        logger.error(
          { username, requiredGroup: this.requiredGroup },
          `access denied: User "@{username}" is not a member of "@{requiredGroup}"`
        );
        return false;
      }
    }

    // empty group is allowed
    return true;
  }

  issueNpmToken(user: RemoteUser, providerToken: string): Promise<string> {
    const jwtSignOptions = this.security.api.jwt?.sign;

    if (isAESLegacy(this.security) || !jwtSignOptions) {
      const npmToken = this.legacyEncrypt(user, providerToken);
      if (!npmToken) {
        throw new Error("Failed to encrypt npm token");
      }

      return Promise.resolve(npmToken);
    } else {
      return this.signJWT(user, providerToken, jwtSignOptions);
    }
  }

  async verifyNpmToken(token: string): Promise<User> {
    const jwtSignOptions = this.security.api.jwt?.sign;

    // if jwt is not enabled, use legacy encryption
    // the token is the password in basic auth
    // decode it and get the token from the payload
    if (isAESLegacy(this.security) || !jwtSignOptions) {
      const payload = this.legacyDecode(token);

      if (!payload.token) {
        throw new Error("Invalid payload token");
      }

      const name = await this.provider.getUsername(payload.token);

      return { ...payload, name };
    } else {
      return this.verifyJWT(token);
    }
  }

  // The ui token of verdaccio is always a JWT token.
  issueUiToken(user: RemoteUser, providerToken: string): Promise<string> {
    const jwtSignOptions = this.security.web.sign;

    return this.signJWT(user, providerToken, jwtSignOptions);
  }

  verifyUiToken(token: string): User {
    return this.verifyJWT(token);
  }

  private signJWT(user: RemoteUser, providerToken: string, jwtSignOptions: JWTSignOptions): Promise<string> {
    // providerToken is not needed in the token, we use jwt to check the expiration
    // remove groups from the user, so that the token is smaller
    const cleanedUser: RemoteUser = { ...user, groups: [] };
    return signPayload(cleanedUser, this.secret, jwtSignOptions);
  }

  private verifyJWT(token: string): User {
    // verifyPayload
    // use internal function to avoid error handling
    return verifyPayload(token, this.secret) as User;
  }

  private legacyEncrypt(user: RemoteUser, providerToken: string): string {
    // encode the user info to get a token
    // save it to the final token, so that we can get the user info from aes token.
    const payloadToken = this.legacyEncode(user, providerToken);

    // use internal function to encrypt token
    const token = aesEncrypt(buildUser(user.name as string, payloadToken), this.secret);

    if (!token) {
      throw new Error("Failed to encrypt token");
    }

    // the return value in verdaccio 5 is a buffer, we need to convert it to a string
    return typeof token === "string" ? token : Buffer.from(token).toString("base64");
  }

  // decode the legacy token
  private legacyDecrypt(value: string): User {
    const payload = aesDecrypt(value, this.secret);
    if (!payload) {
      throw new Error("Failed to decrypt token");
    }

    const res = parseBasicPayload(payload);
    if (!res) {
      throw new Error("Failed to parse token");
    }

    let u: Omit<User, "name">;
    try {
      u = JSON.parse(Buffer.from(res.password, "base64").toString("utf8"));
    } catch {
      u = {
        real_groups: [],
      };
    }

    return { name: res.user, real_groups: u.real_groups ?? [], token: u.token };
  }

  private legacyEncode(user: RemoteUser, providerToken: string): string {
    // legacy token does not have a expiration time
    // we use the provider token to check if the token is still valid
    // remove name and groups from user, to reduce token size
    const u: Omit<User, "name"> = {
      real_groups: user.real_groups,
      token: providerToken,
    };

    // save groups and token in password field
    return Buffer.from(JSON.stringify(u)).toString("base64");
  }

  private legacyDecode(payloadToken: string): Omit<User, "name"> {
    const u: Omit<User, "name"> = JSON.parse(Buffer.from(payloadToken, "base64").toString("utf8"));
    return { real_groups: u.real_groups ?? [], token: u.token };
  }
}
