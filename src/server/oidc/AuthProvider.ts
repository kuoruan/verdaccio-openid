import { Groups } from "@gitbeaker/node";
import TTLCache from "@isaacs/ttlcache";
import { getPublicUrl } from "@verdaccio/url";
import { Issuer, generators } from "openid-client";

import logger from "@/logger";
import { getCallbackPath } from "@/redirect";

import { AuthProvider } from "../plugin/AuthProvider";
import { ParsedPluginConfig } from "../plugin/Config";

import type { RequestOptions } from "@verdaccio/url";
import type { Request } from "express";
import type { OpenIDCallbackChecks, Client } from "openid-client";

export class OpenIDConnectAuthProvider implements AuthProvider {
  private client?: Client;
  private host: string;
  private scope: string;

  private readonly stateCache: TTLCache<string, string>;
  private readonly userinfoCache: TTLCache<string, Record<string, unknown>>;

  constructor(private readonly config: ParsedPluginConfig) {
    this.host = this.config.host;
    this.scope = this.initScope();

    this.stateCache = new TTLCache({ ttl: 5 * 60 * 1000 }); // 5min
    this.userinfoCache = new TTLCache({ ttl: 30 * 1000 }); // 1min

    this.discoverClient();
  }

  private get discoveredClient(): Client {
    if (!this.client) {
      throw new Error("Client has not yet been discovered");
    }

    return this.client;
  }

  private initScope() {
    let scope: string;

    if (this.config.scope) {
      scope = this.config.scope;
    } else {
      scope = "openid email";

      if (this.config.groupsClaim) {
        scope += " groups";
      }
    }

    return scope;
  }

  private async discoverClient() {
    let issuer: Issuer;

    if (this.config.configurationEndpoint) {
      issuer = await Issuer.discover(this.config.configurationEndpoint);
    } else if (
      this.config.authorizationEndpoint ||
      this.config.tokenEndpoint ||
      this.config.userinfoEndpoint ||
      this.config.jwksUri
    ) {
      issuer = new Issuer({
        issuer: this.config.issuer || this.host,
        authorization_endpoint: this.config.authorizationEndpoint,
        token_endpoint: this.config.tokenEndpoint,
        userinfo_endpoint: this.config.userinfoEndpoint,
        jwks_uri: this.config.jwksUri,
      });
    } else {
      issuer = await Issuer.discover(this.host);
    }

    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      response_types: ["code"],
    });
  }

  getId(): string {
    return "oidc";
  }

  getLoginUrl(req: Request): string {
    const redirectUrl = this.getRedirectUrl(req);

    const state = generators.state(32);
    const nonce = generators.nonce();

    this.stateCache.set(state, nonce);

    return this.discoveredClient.authorizationUrl({
      scope: this.scope,
      redirect_uri: redirectUrl,
      state: state,
      nonce: nonce,
    });
  }

  async getToken(callbackReq: Request): Promise<string> {
    const redirectUrl = this.getRedirectUrl(callbackReq);

    const params = this.discoveredClient.callbackParams(callbackReq.url);

    const state = params.state;
    if (!state) {
      throw new Error("No state parameter found in callback request");
    }

    if (!this.stateCache.has(state)) {
      throw new Error("State parameter does not match a known state");
    }

    const nonce = this.stateCache.get(state);
    this.stateCache.delete(state);

    const checks: OpenIDCallbackChecks = {
      state,
      nonce,
      scope: this.scope,
    };
    const tokenSet = await this.discoveredClient.callback(redirectUrl, params, checks);

    if (tokenSet.access_token !== undefined) {
      return tokenSet.access_token;
    }

    throw new Error("No access_token received in getToken callback");
  }

  private async getUserinfo(token: string): Promise<Record<string, unknown>> {
    let userinfo = this.userinfoCache.get(token);
    if (!userinfo) {
      userinfo = await this.discoveredClient.userinfo<Record<string, unknown>>(token);

      this.userinfoCache.set(token, userinfo);
    }
    return userinfo;
  }

  private verifyUsername(username: string, userinfo: Record<string, unknown>): boolean {
    return username === userinfo[this.config.usernameClaim];
  }

  async getUsername(token: string): Promise<string> {
    const userinfo = await this.getUserinfo(token);
    const username = userinfo[this.config.usernameClaim];

    if (username) {
      return String(username);
    }

    throw new Error(`Could not grab username using the ${this.config.usernameClaim} property`);
  }

  async getGroups(username: string, token?: string): Promise<string[]> {
    // if token is set, get user groups from token or provider url.
    if (token) {
      const userinfo = await this.getUserinfo(token);

      if (!this.verifyUsername(username, userinfo)) {
        throw new Error(`Username did not match, expected ${username}`);
      }

      if (this.config.groupsClaim) {
        const groups = userinfo[this.config.groupsClaim];

        if (!groups) {
          throw new Error(`Could not grab groups using the ${this.config.groupsClaim} property`);
        } else if (Array.isArray(groups)) {
          return groups;
        } else if (typeof groups === "string") {
          return [groups];
        } else {
          throw new Error(`Groups claim is not an array or string`);
        }
      }

      if (this.config.providerType) {
        switch (this.config.providerType) {
          case "gitlab": {
            const gitlabGroups = await this.getGitlabGroups(token);
            logger.info({ username, gitlabGroups }, `GitLab user "@{username}" has groups: "@{gitlabGroups}"`);
            return gitlabGroups;
          }
          case "universal":
          default: {
            throw new Error("unexpected provider type");
          }
        }
      }
    }

    let groupUsers;
    if ((groupUsers = this.config.groupUsers)) {
      return Object.keys(groupUsers).filter((group) => {
        return groupUsers[group].includes(username);
      });
    }

    return [];
  }

  async getGitlabGroups(token: string): Promise<string[]> {
    const group = new Groups({
      host: this.host,
      oauthToken: token,
    });

    const userGroups = await group.all();
    return userGroups.map((g) => g.name);
  }

  private getRedirectUrl(req: Request): string {
    const baseUrl = getPublicUrl(this.config.url_prefix, req as RequestOptions).replace(/\/$/, "");
    const path = getCallbackPath(req.params.id);

    return baseUrl + path;
  }
}
