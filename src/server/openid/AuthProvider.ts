import process from "node:process";

import { Groups } from "@gitbeaker/rest";
import type { Request } from "express";
import { type Client, custom, generators, Issuer, type OpenIDCallbackChecks } from "openid-client";

import type { ConfigHolder } from "@/server/config/Config";
import { ERRORS } from "@/server/constants";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import {
  type AuthProvider,
  type OpenIDToken,
  ProviderType,
  type ProviderUser,
  type TokenInfo,
} from "@/server/plugin/AuthProvider";
import { getBaseUrl, getClaimsFromIdToken, hashObject } from "@/server/plugin/utils";
import type { Store } from "@/server/store/Store";

const CLIENT_HTTP_TIMEOUT = 30 * 1000; // 30s

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
      if (e instanceof AggregateError) {
        logger.error({ messages: e.errors.map((e) => (e as Error).message) }, "Could not discover client: @{messages}");
      } else {
        logger.error({ message: e.message }, "Could not discover client: @{message}");
      }

      process.exit(1);
    });
  }

  private get discoveredClient(): Client {
    if (!this.client) {
      throw new ReferenceError(ERRORS.CLIENT_NOT_DISCOVERED);
    }

    return this.client;
  }

  private async discoverClient() {
    let issuer: Issuer;

    const configurationUri = this.config.configurationUri;

    custom.setHttpOptionsDefaults({
      timeout: CLIENT_HTTP_TIMEOUT,
    });

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
          throw new ReferenceError(ERRORS.PROVIDER_HOST_NOT_SET);
        }
        issuer = await Issuer.discover(providerHost);
      }
    }

    const client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      response_types: ["code"],
    });

    this.client = client;
  }

  getId(): string {
    return "openid";
  }

  async getLoginUrl(redirectUrl: string, customState?: string): Promise<string> {
    const state = customState ?? generators.state(32);
    const nonce = generators.nonce();

    await this.store.setOpenIDState(state, nonce, this.getId());

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
      throw new URIError(ERRORS.NO_STATE);
    }

    const nonce = await this.store.getOpenIDState(state, this.getId());

    if (!nonce) {
      throw new URIError(ERRORS.STATE_NOT_FOUND);
    }

    await this.store.deleteOpenIDState(state, this.getId());

    const checks: OpenIDCallbackChecks = {
      state,
      nonce,
      scope: this.scope,
    };

    const baseUrl = getBaseUrl(this.config.urlPrefix, callbackRequest, true);
    const redirectUrl = baseUrl + callbackRequest.path;

    const tokens = await this.discoveredClient.callback(redirectUrl, parameters, checks);
    if (!tokens.access_token) {
      throw new Error(ERRORS.NO_ACCESS_TOKEN_RETURNED);
    }
    if (!tokens.id_token && this.scope.includes("openid")) {
      throw new Error(ERRORS.NO_ID_TOKEN_RETURNED);
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
   * @param tokens
   * @returns
   */
  private getUserinfoFromIdToken(tokens: TokenInfo): Record<string, unknown> {
    const idToken = tokens.idToken;
    if (!idToken) {
      throw new TypeError(ERRORS.ID_TOKEN_NOT_FOUND);
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

    const usernameClaim = this.config.usernameClaim;
    const groupsClaim = this.config.groupsClaim;

    if (typeof token !== "string") {
      /**
       * username and groups can be in the id_token if the scope is openid.
       */
      try {
        userinfo = this.getUserinfoFromIdToken(token);

        username = userinfo[usernameClaim];
        if (groupsClaim) {
          groups = userinfo[groupsClaim];
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

        username ??= userinfo[usernameClaim];
        if (groupsClaim) {
          groups ??= userinfo[groupsClaim];
        }
      } catch {
        debug("Could not get userinfo from userinfo endpoint.");
      }
    }

    if (!username) {
      throw new Error(`Could not get username with claim: "${usernameClaim}"`);
    }

    // We prefer the groups from the providerType if it is set.
    const providerType = this.config.providerType;
    if (providerType) {
      groups = await this.getGroupsWithProviderType(token, providerType);
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
  private async getGroupsWithProviderType(token: OpenIDToken, providerType: ProviderType): Promise<string[]> {
    const key = typeof token === "string" ? token : (token.subject ?? hashObject(token));

    let groups: string[] | null | undefined;

    try {
      groups = await this.store.getUserGroups?.(key, this.getId());
    } catch {
      debug("No user groups cache found for key: %s", key);
    }

    if (groups) return groups;

    switch (providerType) {
      case ProviderType.Gitlab: {
        groups = await this.getGitlabGroups(token);
        break;
      }
      default: {
        throw new ReferenceError(ERRORS.PROVIDER_NOT_FOUND);
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
