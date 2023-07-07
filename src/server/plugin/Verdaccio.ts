import {
  Auth,
  buildUser,
  isAESLegacy,
  signPayload,
  verifyJWTPayload,
  aesDecrypt,
  parseBasicPayload,
} from "@verdaccio/auth";
import merge from "deepmerge";

import { VerdaccioConfig } from "../plugin/Config";

import type { JWTSignOptions, RemoteUser } from "@verdaccio/types";

// https://github.com/verdaccio/verdaccio/blob/master/packages/config/src/security.ts
const TIME_EXPIRATION_7D = "7d";

const defaultSecurity = {
  api: {
    legacy: true,
  },
  web: {
    sign: {
      expiresIn: TIME_EXPIRATION_7D,
    },
    verify: {},
  },
};

function getSecurity(config: VerdaccioConfig) {
  return merge(defaultSecurity, config.security);
}

export type UserWithToken = RemoteUser & { token?: string; legacyToken?: boolean };

/**
 * Abstract Verdaccio version differences and usage of all Verdaccio objects.
 */
export class Verdaccio {
  readonly security: ReturnType<typeof getSecurity>;

  constructor(private readonly config: VerdaccioConfig, private readonly auth: Auth) {
    this.security = getSecurity(this.config);
  }

  issueNpmToken(user: RemoteUser, providerToken: string): Promise<string> {
    const jwtSignOptions = this.security?.api?.jwt?.sign;

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
    const jwtSignOptions = this.security?.api?.jwt?.sign;

    if (isAESLegacy(this.security) || !jwtSignOptions) {
      return this.legacyDecrypt(token);
    } else {
      return this.verifyJWT(token);
    }
  }

  // The ui token of verdaccio is always a JWT token.
  issueUiToken(user: RemoteUser, providerToken: string): Promise<string> {
    const jwtSignOptions = this.security?.web?.sign;

    return this.signJWT(user, providerToken, jwtSignOptions);
  }

  verifyUiToken(token: string): UserWithToken {
    return this.verifyJWT(token);
  }

  private signJWT(user: UserWithToken, providerToken: string, jwtSignOptions: JWTSignOptions): Promise<string> {
    return signPayload({ ...user, providerToken } as UserWithToken, this.auth.secret, jwtSignOptions);
  }

  private verifyJWT(token: string): UserWithToken {
    // verifyPayload
    // use internal function to avoid error handling
    const user = verifyJWTPayload(token, this.auth.secret);

    return { ...user, legacyToken: false };
  }

  private legacyEncrypt(user: RemoteUser, providerToken: string): string {
    // use internal function to encrypt token
    const token = this.auth.aesEncrypt(buildUser(user.name as string, providerToken));

    if (!token) {
      throw new Error("Failed to encrypt token");
    }

    return token;
  }

  private legacyDecrypt(value: string): UserWithToken {
    const payload = aesDecrypt(value, this.auth.secret);
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
