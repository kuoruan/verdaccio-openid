import { Groups } from "@gitbeaker/rest";
import type { Request } from "express";
import {
  type Client,
  custom,
  type CustomHttpOptionsProvider,
  generators,
  Issuer,
  type OpenIDCallbackChecks,
} from "openid-client";

import { getCallbackPath } from "@/redirect";
import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import type { AuthProvider, OpenIDToken, ProviderUser, TokenInfo } from "@/server/plugin/AuthProvider";
import { getBaseUrl, getClaimsFromIdToken, hashObject } from "@/server/plugin/utils";
import type { Store } from "@/server/store/Store";

const CLIENT_HTTP_TIMEOUT = 30 * 1000; // 30s

const httpOptionsProvider: CustomHttpOptionsProvider = (_, options) => {
  options.timeout = CLIENT_HTTP_TIMEOUT;

  return options;
};

export class OpenIDConnectAuthProvider implements AuthProvider {
  private client?: Client;
  private providerHost: string;
  private scope: string;

  constructor(
    private readonly config: ConfigHolder,
    private readonly store: Store,
  ) {
    this.providerHost = this.config.providerHost;
    this.scope = this.config.scope;

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

    const configurationUri = this.config.configurationUri;

    Issuer[custom.http_options] = httpOptionsProvider;

    if (configurationUri) {
      issuer = await Issuer.discover(configurationUri);
    } else {
      const providerHost = this.providerHost;

      const authorizationEndpoint = this.config.authorizationEndpoint;
      const tokenEndpoint = this.config.tokenEndpoint;
      const userinfoEndpoint = this.config.userinfoEndpoint;
      const jwksUri = this.config.jwksUri;

      if ([authorizationEndpoint, tokenEndpoint, userinfoEndpoint, jwksUri].some((endpoint) => !!endpoint)) {
        issuer = new Issuer({
          issuer: this.config.issuer ?? providerHost,
          authorization_endpoint: authorizationEndpoint,
          token_endpoint: tokenEndpoint,
          userinfo_endpoint: userinfoEndpoint,
          jwks_uri: jwksUri,
        });
      } else {
        if (!providerHost) {
          throw new ReferenceError("Provider host is not set");
        }
        issuer = await Issuer.discover(providerHost);
      }
    }

    issuer[custom.http_options] = httpOptionsProvider;
    issuer.Client[custom.http_options] = httpOptionsProvider;

    const client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      response_types: ["code"],
    });

    client[custom.http_options] = httpOptionsProvider;

    this.client = client;
  }

  getId(): string {
    return "openid";
  }

  async getLoginUrl(request: Request): Promise<string> {
    const baseUrl = getBaseUrl(this.config.urlPrefix, request, true);
    const redirectUrl = baseUrl + getCallbackPath(request.params.id);

    const state = generators.state(32);
    const nonce = generators.nonce();

    await this.store.setState(state, nonce, this.getId());

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
  async getToken(callbackRequest: Request): Promise<TokenInfo> {
    const parameters = this.discoveredClient.callbackParams(callbackRequest.url);

    debug("Receive callback parameters, %j", parameters);

    const state = parameters.state;
    if (!state) {
      throw new URIError("No state parameter found in callback request");
    }

    const nonce = await this.store.getState(state, this.getId());

    if (!nonce) {
      throw new URIError("State parameter does not match a known state");
    }

    await this.store.deleteState(state, this.getId());

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
    const claims = tokens.claims();

    if (!expiresAt && tokens.expires_in) {
      expiresAt = Math.trunc(Date.now() / 1000) + tokens.expires_in;
    }

    // if expires_at is not set, try to get it from the id_token
    if (!expiresAt && tokens.id_token) {
      expiresAt = claims.exp;
    }

    return {
      subject: claims.sub,
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
  private getUserinfoFromIdToken(token: TokenInfo): Record<string, unknown> {
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
  private async getUserinfoFromEndpoint(token: OpenIDToken): Promise<Record<string, unknown>> {
    let accessToken: string;
    let key: string;

    if (typeof token === "string") {
      accessToken = token;
      key = token;
    } else {
      accessToken = token.accessToken;
      key = token.subject ?? hashObject(token);
    }

    let userinfo: Record<string, unknown> | null | undefined;

    try {
      userinfo = await this.store.getUserInfo?.(key, this.getId());
    } catch {
      debug("No userinfo cache found for key: %s", key);
    }

    if (!userinfo) {
      userinfo = await this.discoveredClient.userinfo<Record<string, unknown>>(accessToken);

      try {
        await this.store.setUserInfo?.(key, userinfo, this.getId());
      } catch (e: any) {
        logger.warn({ message: e.message }, "Could not set userinfo cache: @{message}");
      }
    }
    return userinfo;
  }

  /**
   * Get the user from the userinfo.
   *
   * @param token
   * @returns
   */
  async getUserinfo(token: OpenIDToken): Promise<ProviderUser> {
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

    // We prefer the groups from the providerType if it is set.
    if (this.config.providerType) {
      groups = await this.getGroupsWithProviderType(token, this.config.providerType);
    }

    if (groups) {
      groups = Array.isArray(groups) ? groups.map(String) : [String(groups)];
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
  private async getGroupsWithProviderType(token: OpenIDToken, providerType: string): Promise<string[]> {
    const key = typeof token === "string" ? token : (token.subject ?? hashObject(token));

    let groups: string[] | null | undefined;

    try {
      groups = await this.store.getUserGroups?.(key, this.getId());
    } catch {
      debug("No user groups cache found for key: %s", key);
    }

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

    try {
      await this.store.setUserGroups?.(key, groups, this.getId());
    } catch (e: any) {
      logger.warn({ message: e.message }, "Could not set user groups cache: @{message}");
    }

    return groups;
  }

  /**
   * Get the groups for the user from the Gitlab API.
   *
   * @param token
   * @returns {Promise<string[]>} The groups the user is in.
   */
  async getGitlabGroups(token: OpenIDToken): Promise<string[]> {
    const group = new Groups({
      host: this.providerHost,
      oauthToken: typeof token === "string" ? token : token.accessToken,
    });

    const userGroups = await group.all();

    return userGroups.map((g) => g.name);
  }
}
