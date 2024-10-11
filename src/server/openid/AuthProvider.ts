import { Groups } from "@gitbeaker/rest";
import TTLCache from "@isaacs/ttlcache";
import type { Request } from "express";
import { type Client, generators, Issuer, type OpenIDCallbackChecks } from "openid-client";

import { getCallbackPath } from "@/redirect";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import type { AuthProvider, ConfigHolder, ProviderUser, Token, TokenSet } from "@/server/plugin/AuthProvider";
import { extractAccessToken, getBaseUrl, getClaimsFromIdToken, hashToken } from "@/server/plugin/utils";

export class OpenIDConnectAuthProvider implements AuthProvider {
  private client?: Client;
  private providerHost: string;
  private scope: string;

  private readonly stateCache: TTLCache<string, string>;
  private readonly userinfoCache: TTLCache<string, Record<string, unknown>>;
  private readonly groupsCache: TTLCache<string, string[]>;

  constructor(private readonly config: ConfigHolder) {
    this.providerHost = this.config.providerHost;
    this.scope = this.config.scope;

    this.stateCache = new TTLCache({ max: 1000, ttl: 5 * 60 * 1000 }); // 5min
    this.userinfoCache = new TTLCache({ max: 1000, ttl: 60 * 1000 }); // 1min
    this.groupsCache = new TTLCache({ max: 1000, ttl: 5 * 60 * 1000 }); // 5m;

    this.discoverClient().catch((e) => {
      logger.error({ message: e.message }, "Could not discover client: @{message}");
    });
  }

  private get discoveredClient(): Client {
    if (!this.client) {
      throw new ReferenceError("Client has not yet been discovered");
    }

    return this.client;
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
        issuer: this.config.issuer ?? this.providerHost,
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

  getLoginUrl(request: Request): string {
    const baseUrl = getBaseUrl(this.config.urlPrefix, request, true);
    const redirectUrl = baseUrl + getCallbackPath(request.params.id);

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

  /**
   * Parse callback request and get the token from provider.
   *
   * @param callbackRequest
   * @returns
   */
  async getToken(callbackRequest: Request): Promise<TokenSet> {
    const parameters = this.discoveredClient.callbackParams(callbackRequest.url);

    debug("Receive callback parameters, %j", parameters);

    const state = parameters.state;
    if (!state) {
      throw new URIError("No state parameter found in callback request");
    }

    if (!this.stateCache.has(state)) {
      throw new URIError("State parameter does not match a known state");
    }

    const nonce = this.stateCache.get(state);
    this.stateCache.delete(state);

    const checks: OpenIDCallbackChecks = {
      state,
      nonce,
      scope: this.scope,
    };

    const baseUrl = getBaseUrl(this.config.urlPrefix, callbackRequest, true);
    const redirectUrl = baseUrl + callbackRequest.path;

    const tokens = await this.discoveredClient.callback(redirectUrl, parameters, checks);
    if (!tokens.access_token) {
      throw new Error("No access_token was returned from the provider");
    }
    if (!tokens.id_token && this.scope.includes("openid")) {
      throw new Error(`"openid" scope is requested but no id_token was returned from the provider`);
    }

    let expiresAt = tokens.expires_at;
    // if expires_at is not set, try to get it from the id_token
    if (!expiresAt && tokens.id_token) {
      expiresAt = getClaimsFromIdToken(tokens.id_token).exp as number;
    }

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      expiresAt: expiresAt,
    };
  }

  /**
   * Get the user info from id_token
   *
   * @param token
   * @returns
   */
  private getUserinfoFromIdToken(token: TokenSet): Record<string, unknown> {
    const idToken = token.idToken;
    if (!idToken) {
      throw new TypeError("No id_token found in token");
    }
    return getClaimsFromIdToken(idToken);
  }

  /**
   * Get the user info from the userinfo endpoint or from the cache.
   *
   * @param token
   * @returns
   */
  private async getUserinfoFromEndpoint(token: Token): Promise<Record<string, unknown>> {
    const key = hashToken(token);

    let userinfo = this.userinfoCache.get(key);
    if (!userinfo) {
      userinfo = await this.discoveredClient.userinfo<Record<string, unknown>>(extractAccessToken(token));

      this.userinfoCache.set(key, userinfo);
    }
    return userinfo;
  }

  /**
   * Get the user from the userinfo.
   *
   * @param token
   * @returns
   */
  async getUserinfo(token: Token): Promise<ProviderUser> {
    let userinfo: Record<string, unknown>;

    let username: unknown, groups: unknown;
    if (typeof token !== "string") {
      /**
       * username and groups can be in the id_token if the scope is openid.
       */
      try {
        userinfo = this.getUserinfoFromIdToken(token);

        username = userinfo[this.config.usernameClaim];
        if (this.config.groupsClaim) {
          groups = userinfo[this.config.groupsClaim];
        }
      } catch {
        debug("Could not get userinfo from id_token. Trying userinfo endpoint...");
      }
    }

    if (!username || !groups) {
      /**
       * or we can get them from the userinfo endpoint.
       */
      try {
        userinfo = await this.getUserinfoFromEndpoint(token);

        username ??= userinfo[this.config.usernameClaim];
        if (this.config.groupsClaim) {
          groups ??= userinfo[this.config.groupsClaim];
        }
      } catch {
        debug("Could not get userinfo from userinfo endpoint.");
      }
    }

    if (!username) {
      throw new Error(`Could not get username with claim: "${this.config.usernameClaim}"`);
    }

    if (!groups && this.config.providerType) {
      groups = await this.getGroupsWithProviderType(token, this.config.providerType);
    }

    if (groups) {
      if (Array.isArray(groups)) {
        groups = groups.map(String);
      } else if (typeof groups === "string") {
        groups = [groups];
      } else {
        throw new TypeError(`Groups claim is not an array or string`);
      }
    }

    return {
      name: String(username),
      groups: groups as string[] | undefined,
    };
  }

  /**
   * Get the groups for the user from the provider.
   *
   * @param token
   * @param providerType
   * @returns
   */
  private async getGroupsWithProviderType(token: Token, providerType: string): Promise<string[]> {
    const key = hashToken(token);

    let groups = this.groupsCache.get(key);

    if (groups) return groups;

    switch (providerType) {
      case "gitlab": {
        groups = await this.getGitlabGroups(token);
        break;
      }
      default: {
        throw new ReferenceError("Unexpected provider type.");
      }
    }

    this.groupsCache.set(key, groups);
    return groups;
  }

  /**
   * Get the groups for the user from the Gitlab API.
   *
   * @param token
   * @returns {Promise<string[]>} The groups the user is in.
   */
  async getGitlabGroups(token: Token): Promise<string[]> {
    const group = new Groups({
      host: this.providerHost,
      oauthToken: extractAccessToken(token),
    });

    const userGroups = await group.all();

    return userGroups.map((g) => g.name);
  }
}
