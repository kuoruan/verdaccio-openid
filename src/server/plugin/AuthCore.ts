import {
  aesDecrypt,
  Auth,
  buildUser,
  isAESLegacy,
  parseBasicPayload,
  signPayload,
  verifyJWTPayload,
} from "@verdaccio/auth";
import { defaultLoggedUserRoles } from "@verdaccio/config";
import type { JWTSignOptions, RemoteUser, Security } from "@verdaccio/types";

import { stringifyQueryParams } from "@/query-params";

import logger from "../logger";
import { ParsedPluginConfig } from "./Config";

export type UserWithToken = RemoteUser & { token?: string; legacyToken?: boolean };

export class AuthCore {
  private readonly security: Security;

  private auth?: Auth;

  private readonly configuredGroups: Record<string, true>;

  constructor(private readonly parsedConfig: ParsedPluginConfig) {
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

  createAuthenticatedUser(username: string, groups: string[]): RemoteUser {
    const relevantGroups = groups.filter((group) => group in this.configuredGroups);

    relevantGroups.push(username);

    // put required group at the end
    if (this.requiredGroup) {
      relevantGroups.push(this.requiredGroup);
    }

    // get unique and sorted groups
    const realGroups = relevantGroups.filter((val, index, self) => self.indexOf(val) === index).sort();

    const user: RemoteUser = {
      name: username,
      groups: [...defaultLoggedUserRoles, ...realGroups],
      real_groups: realGroups,
    };
    logger.info({ user: JSON.stringify(user) }, "created authenticated user: @{user}");

    return user;
  }

  async createUiCallbackUrl(username: string, providerToken: string, groups: string[]): Promise<string> {
    const user = this.createAuthenticatedUser(username, groups);

    const uiToken = await this.issueUiToken(user, providerToken);
    const npmToken = await this.issueNpmToken(user, providerToken);

    const query = { username, uiToken, npmToken };
    return `/?${stringifyQueryParams(query)}`;
  }

  /**
   * Check if the user is allowed to access the registry
   *
   * @param username
   * @param groups
   * @returns true if the user is allowed to access the registry
   */
  authenticate(username: string, groups: string[] = []): boolean {
    if (this.requiredGroup) {
      if (username !== this.requiredGroup && !groups.includes(this.requiredGroup)) {
        logger.error(
          { username, requiredGroup: this.requiredGroup },
          `Access denied: User "@{username}" is not a member of "@{requiredGroup}"`
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

  verifyNpmToken(token: string): UserWithToken {
    const jwtSignOptions = this.security.api.jwt?.sign;

    if (isAESLegacy(this.security) || !jwtSignOptions) {
      return this.legacyDecrypt(token);
    } else {
      return this.verifyJWT(token);
    }
  }

  // The ui token of verdaccio is always a JWT token.
  issueUiToken(user: RemoteUser, providerToken: string): Promise<string> {
    const jwtSignOptions = this.security.web.sign;

    return this.signJWT(user, providerToken, jwtSignOptions);
  }

  verifyUiToken(token: string): UserWithToken {
    return this.verifyJWT(token);
  }

  private signJWT(user: UserWithToken, providerToken: string, jwtSignOptions: JWTSignOptions): Promise<string> {
    return signPayload({ ...user, providerToken } as UserWithToken, this.secret, jwtSignOptions);
  }

  private verifyJWT(token: string): UserWithToken {
    // verifyPayload
    // use internal function to avoid error handling
    const user = verifyJWTPayload(token, this.secret);

    return { ...user, legacyToken: false };
  }

  private legacyEncrypt(user: RemoteUser, providerToken: string): string {
    if (!this.auth) {
      throw new Error("Auth object is not initialized");
    }
    // use internal function to encrypt token
    const token = this.auth!.aesEncrypt(buildUser(user.name as string, providerToken));

    if (!token) {
      throw new Error("Failed to encrypt token");
    }

    // the return value in verdaccio 5 is a buffer
    return typeof token === "string" ? token : Buffer.from(token).toString("base64");
  }

  private legacyDecrypt(value: string): UserWithToken {
    const payload = aesDecrypt(value, this.secret);
    if (!payload) {
      throw new Error("Failed to decrypt token");
    }

    const res = parseBasicPayload(payload);
    if (!res) {
      throw new Error("Failed to parse token");
    }

    return { name: res.user, real_groups: [], groups: [], token: res.password, legacyToken: true };
  }
}
