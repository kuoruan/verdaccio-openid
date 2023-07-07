import merge from "lodash/merge";

import { VerdaccioConfig } from "../plugin/Config";

import type { Cache } from "./Cache";
import type { Config, IBasicAuth, JWTSignOptions, RemoteUser } from "@verdaccio/types";
import type { NextFunction } from "express";

export interface Auth extends IBasicAuth<Config> {
  config: Config;
  apiJWTmiddleware(): NextFunction;
  jwtEncrypt(user: RemoteUser, signOptions: JWTSignOptions): Promise<string>;
  webUIJWTmiddleware(): NextFunction;
}

export type User = RemoteUser;

// Most of this is duplicated Verdaccio code because it is unfortunately not availabel via API.
// https://github.com/verdaccio/verdaccio/blob/master/src/lib/auth-utils.ts#L129

const TIME_EXPIRATION_7D = "7d" as const;

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
} as const;

function getSecurity(config: VerdaccioConfig) {
  return merge({}, defaultSecurity, config.security);
}

/**
 * Abstract Verdaccio version differences and usage of all Verdaccio objects.
 */
export class Verdaccio {
  readonly security: ReturnType<typeof getSecurity>;

  private auth!: Auth;

  constructor(private readonly config: VerdaccioConfig, private readonly cache: Cache) {
    this.security = getSecurity(this.config);
  }

  setAuth(auth: Auth): Verdaccio {
    this.auth = auth;
    return this;
  }

  issueNpmToken(providerToken: string, user: User): Promise<string> {
    const jwtSignOptions = this.security?.api?.jwt?.sign;

    if (jwtSignOptions) {
      return this.issueVerdaccioJWT(user, jwtSignOptions);
    }

    const npmToken = this.encrypt(user.name + ":" + providerToken);

    // save relationship between npm token and provider token
    this.cache.setProviderToken(npmToken, providerToken);
    return Promise.resolve(npmToken);
  }

  issueUiToken(user: User): Promise<string> {
    const jwtSignOptions = this.security?.web?.sign;

    return this.issueVerdaccioJWT(user, jwtSignOptions);
  }

  // https://github.com/verdaccio/verdaccio/blob/master/src/api/web/endpoint/user.ts#L31
  private issueVerdaccioJWT(user: User, jwtSignOptions: JWTSignOptions): Promise<string> {
    return this.auth.jwtEncrypt(user, jwtSignOptions);
  }

  private encrypt(text: string): string {
    return this.auth.aesEncrypt(Buffer.from(text)).toString("base64");
  }
}
