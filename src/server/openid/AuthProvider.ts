import { Groups } from "@gitbeaker/node";
import TTLCache from "@isaacs/ttlcache";
import { getPublicUrl } from "@verdaccio/url";
import { Issuer, generators } from "openid-client";

import { getCallbackPath } from "@/redirect";

import { AuthProvider, ConfigHolder } from "../plugin/AuthProvider";

import type { RequestOptions } from "@verdaccio/url";
import type { Request } from "express";
import type { OpenIDCallbackChecks, Client } from "openid-client";

export class OpenIDConnectAuthProvider implements AuthProvider {
  private client?: Client;
  private providerHost: string;
  private scope: string;

  private readonly stateCache: TTLCache<string, string>;
  private readonly userinfoCache: TTLCache<string, Record<string, unknown>>;
  private readonly groupsCache: TTLCache<string, string[]>;

  constructor(private readonly config: ConfigHolder) {
    this.providerHost = this.config.providerHost;
    this.scope = this.initScope();

    this.stateCache = new TTLCache({ max: 1000, ttl: 5 * 60 * 1000 }); // 5min
    this.userinfoCache = new TTLCache({ max: 1000, ttl: 30 * 1000 }); // 1min
    this.groupsCache = new TTLCache({ max: 1000, ttl: 5 * 60 * 1000 }); // 5m;

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

    if (this.config.configurationUri) {
      issuer = await Issuer.discover(this.config.configurationUri);
    } else if (
      [
        this.config.authorizationEndpoint,
        this.config.tokenEndpoint,
        this.config.userinfoEndpoint,
        this.config.jwksUri,
      ].some((endpoint) => !!endpoint)
    ) {
      issuer = new Issuer({
        issuer: this.config.issuer || this.providerHost,
        authorization_endpoint: this.config.authorizationEndpoint,
        token_endpoint: this.config.tokenEndpoint,
        userinfo_endpoint: this.config.userinfoEndpoint,
        jwks_uri: this.config.jwksUri,
      });
    } else {
      issuer = await Issuer.discover(this.providerHost);
    }

    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      response_types: ["code"],
    });
  }

  getId(): string {
    return "openid";
  }

  getLoginUrl(req: Request): string {
    const baseUrl = this.getBaseUrl(req);
    const redirectUrl = baseUrl + getCallbackPath(req.params.id);

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

    const baseUrl = this.getBaseUrl(callbackReq);
    const redirectUrl = baseUrl + callbackReq.path;

    const tokenSet = await this.discoveredClient.callback(redirectUrl, params, checks);

    if (tokenSet.access_token !== undefined) {
      return tokenSet.access_token;
    }

    throw new Error(`No "access_token" received in getToken callback.`);
  }

  private async getUserinfo(token: string): Promise<Record<string, unknown>> {
    let userinfo = this.userinfoCache.get(token);
    if (!userinfo) {
      userinfo = await this.discoveredClient.userinfo<Record<string, unknown>>(token);

      this.userinfoCache.set(token, userinfo);
    }
    return userinfo;
  }

  async getUsername(token: string): Promise<string> {
    const userinfo = await this.getUserinfo(token);
    const username = userinfo[this.config.usernameClaim];

    if (username) {
      return String(username);
    }

    throw new Error(`Could not grab username using the ${this.config.usernameClaim} property`);
  }

  /**
   * Get the groups for the user from the groups claim or from the oidc endpoint.
   *
   * @param token
   * @returns {Promise<string[]>} The groups the user is in.
   */
  async getGroups(token: string): Promise<string[]> {
    if (this.config.groupsClaim) {
      const userinfo = await this.getUserinfo(token);
      const groups = userinfo[this.config.groupsClaim];

      if (!groups) {
        throw new Error(`Could not grab groups using the ${this.config.groupsClaim} property`);
      } else if (Array.isArray(groups)) {
        return groups;
      } else if (typeof groups === "string") {
        return [groups];
      } else {
        throw new Error(`Groups claim is not an array or string.`);
      }
    }

    if (this.config.providerType) {
      let groups = this.groupsCache.get(token);

      if (groups) return groups;

      switch (this.config.providerType) {
        case "gitlab": {
          groups = await this.getGitlabGroups(token);
          break;
        }
        default: {
          throw new Error("Unexpected provider type.");
        }
      }

      this.groupsCache.set(token, groups);
      return groups;
    }

    throw new Error("No groups claim or provider type configured");
  }

  /**
   * Get the groups for the user from the Gitlab API.
   *
   * @param token
   * @returns {Promise<string[]>} The groups the user is in.
   */
  async getGitlabGroups(token: string): Promise<string[]> {
    const group = new Groups({
      host: this.providerHost,
      oauthToken: token,
    });

    const userGroups = await group.all();

    return userGroups.map((g) => g.name);
  }

  public getBaseUrl(req: Request): string {
    return getPublicUrl(this.config.urlPrefix, req as RequestOptions).replace(/\/$/, "");
  }
}
