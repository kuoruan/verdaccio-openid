import type { Request } from "express";

import type { CustomFetch } from "openid-client";

import type { ConfigHolder } from "@/server/config/Config";
import { ERRORS } from "@/server/constants";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { getOpenIDClient, type OpenIDClient } from "@/server/openid/client";
import {
  type AuthProvider,
  type OpenIDToken,
  ProviderType,
  type ProviderUser,
  type TokenInfo,
} from "@/server/plugin/AuthProvider";
import { getClaimsFromIdToken, hashObject } from "@/server/crypto";
import { getGitlabGroups as fetchGitlabGroups } from "@/server/openid/provider/gitlab";
import { getFullUrl } from "@/server/plugin/utils";
import type { OpenIDStateStore, ProviderCache } from "@/server/store/Store";
import type { ProxiedTransport } from "@/transport";

import { createDiscoveryCooldownError, createDiscoveryError } from "./DiscoveryErrorUtils";

const CLIENT_HTTP_TIMEOUT = 30; // 30s
const DISCOVERY_RETRY_BASE_MS = 5 * 1000; // initial retry interval (5s)
const DISCOVERY_RETRY_MAX_MS = 60 * 1000; // max retry interval (60s)

interface DiscoveryFailure {
  error: Error;
  timestamp: number;
  attempts: number;
  intervalMs: number;
}

function getTokenCacheKey(token: OpenIDToken): string {
  return typeof token === "string" ? token : (token.subject ?? hashObject(token));
}

/** The name, subject and groups read from one claims source. */
interface Identity {
  name?: unknown;
  subject?: unknown;
  groups?: unknown;
}

export class OpenIDConnectAuthProvider implements AuthProvider {
  private configuration?: OpenIDClient.Configuration;
  private discoveryPromise?: Promise<OpenIDClient.Configuration>;
  private lastDiscoveryFailure?: DiscoveryFailure;
  private readonly customFetch?: typeof fetch;

  constructor(
    private readonly config: ConfigHolder,
    private readonly store: OpenIDStateStore & ProviderCache,
    transport?: ProxiedTransport,
  ) {
    this.customFetch = transport?.fetch;

    // Start configuration discovery in the background
    void (async () => {
      try {
        await this.ensureConfiguration();
        logger.info("OpenID Connect configuration discovery completed successfully");
      } catch (e: any) {
        logger.error({ message: e.message }, "@{message}");
      }
    })();
  }

  private ensureConfiguration(): Promise<OpenIDClient.Configuration> {
    if (this.configuration) {
      return Promise.resolve(this.configuration);
    }

    if (!this.discoveryPromise && this.lastDiscoveryFailure) {
      const elapsed = Date.now() - this.lastDiscoveryFailure.timestamp;

      if (elapsed < this.lastDiscoveryFailure.intervalMs) {
        const discoveryCooldownError = createDiscoveryCooldownError(
          this.lastDiscoveryFailure.error,
          this.lastDiscoveryFailure.intervalMs - elapsed,
        );

        throw discoveryCooldownError;
      }
    }

    this.discoveryPromise ??= this.discoverConfiguration()
      .then((configuration) => {
        this.configuration = configuration;
        this.lastDiscoveryFailure = undefined;

        return configuration;
      })
      .catch((error) => {
        const discoveryError = createDiscoveryError(error);

        const attempts = (this.lastDiscoveryFailure?.attempts ?? 0) + 1;
        const intervalMs = Math.min(DISCOVERY_RETRY_BASE_MS * Math.pow(2, attempts - 1), DISCOVERY_RETRY_MAX_MS);

        this.lastDiscoveryFailure = {
          error: discoveryError,
          timestamp: Date.now(),
          attempts,
          intervalMs,
        };
        this.discoveryPromise = undefined;

        throw discoveryError;
      });

    return this.discoveryPromise;
  }

  private async discoverConfiguration(): Promise<OpenIDClient.Configuration> {
    const openidClient = await getOpenIDClient();

    const configurationUri = this.config.configurationUri;
    const providerHost = this.config.providerHost;
    const clientId = this.config.clientId;
    const clientSecret = this.config.clientSecret;

    const { customFetch } = this;
    // CustomFetchOptions is a subset of RequestInit at runtime; the cast
    // only bridges openid-client's narrower static type.
    const fetchHook: CustomFetch | undefined = customFetch && ((url, init) => customFetch(url, init as RequestInit));

    const options: OpenIDClient.DiscoveryRequestOptions = {
      timeout: CLIENT_HTTP_TIMEOUT,
    };

    if (fetchHook) options[openidClient.customFetch] = fetchHook;

    if (configurationUri) {
      // Use the configuration URI directly
      return openidClient.discovery(new URL(configurationUri), clientId, clientSecret, undefined, options);
    }

    const authorizationEndpoint = this.config.authorizationEndpoint;
    const tokenEndpoint = this.config.tokenEndpoint;
    const userinfoEndpoint = this.config.userinfoEndpoint;
    const jwksUri = this.config.jwksUri;

    if ([authorizationEndpoint, tokenEndpoint, userinfoEndpoint, jwksUri].some((endpoint) => !!endpoint)) {
      // Manually construct ServerMetadata
      const serverMetadata: OpenIDClient.ServerMetadata = {
        issuer: this.config.issuer ?? providerHost,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        userinfo_endpoint: userinfoEndpoint,
        jwks_uri: jwksUri,
      };

      const configuration = new openidClient.Configuration(serverMetadata, clientId, clientSecret);

      // Set timeout
      configuration.timeout = CLIENT_HTTP_TIMEOUT;

      if (fetchHook) configuration[openidClient.customFetch] = fetchHook;

      return configuration;
    }

    if (!providerHost) {
      throw new ReferenceError(ERRORS.PROVIDER_HOST_NOT_SET);
    }

    return openidClient.discovery(new URL(providerHost), clientId, clientSecret, undefined, options);
  }

  getId(): string {
    return "openid";
  }

  async getLoginUrl(redirectUrl: string, customState?: string): Promise<string> {
    const openidClient = await getOpenIDClient();

    const state = customState ?? openidClient.randomState();
    const nonce = openidClient.randomNonce();

    await this.store.setOpenIDState(state, nonce, this.getId());

    const configuration = await this.ensureConfiguration();

    const url = openidClient.buildAuthorizationUrl(configuration, {
      scope: this.config.scope,
      redirect_uri: redirectUrl,
      state: state,
      nonce: nonce,
    });

    return url.toString();
  }

  /**
   * Exchange the code in a callback request for tokens.
   *
   * @param callbackRequest the request the provider redirected to
   * @returns the tokens the provider issued
   * @throws {URIError} when the callback carries no state, or one this provider did not issue
   */
  async getToken(callbackRequest: Request): Promise<TokenInfo> {
    const openidClient = await getOpenIDClient();

    const url = getFullUrl(this.config.urlPrefix, callbackRequest);

    debug("Receive callback URL, %s", url.toString());

    const state = url.searchParams.get("state");

    if (!state) {
      throw new URIError(ERRORS.NO_STATE);
    }

    const nonce = await this.store.getOpenIDState(state, this.getId());

    if (!nonce) {
      throw new URIError(ERRORS.STATE_NOT_FOUND);
    }

    await this.store.deleteOpenIDState(state, this.getId());

    const configuration = await this.ensureConfiguration();

    const tokens = await openidClient.authorizationCodeGrant(configuration, url, {
      expectedState: state,
      expectedNonce: nonce,
    });

    if (!tokens.access_token) {
      throw new Error(ERRORS.NO_ACCESS_TOKEN_RETURNED);
    }
    if (!tokens.id_token && this.config.scope.includes("openid")) {
      throw new Error(ERRORS.NO_ID_TOKEN_RETURNED);
    }

    const claims = tokens.claims();
    if (!claims) {
      throw new Error(ERRORS.NO_CLAIMS_FOUND);
    }

    let expiresAt: number | undefined;

    if (tokens.expires_in) {
      expiresAt = Math.trunc(Date.now() / 1000) + tokens.expires_in;
    }

    // if expires_at is not set, try to get it from the id_token
    if (!expiresAt && tokens.id_token && claims.exp) {
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
   * Read the user info from the ID token of a token response.
   *
   * @param tokens the token response
   * @returns the claims of the ID token
   * @throws {TypeError} when the response carries no ID token
   */
  private getUserinfoFromIdToken(tokens: TokenInfo): Record<string, unknown> {
    const idToken = tokens.idToken;
    if (!idToken) {
      throw new TypeError(ERRORS.ID_TOKEN_NOT_FOUND);
    }
    return getClaimsFromIdToken(idToken);
  }

  /**
   * Read the user info from the cache, or fetch it from the userinfo endpoint.
   *
   * @param token the provider token
   * @returns the user info claims
   */
  private async getUserinfoFromEndpoint(token: OpenIDToken): Promise<Record<string, unknown>> {
    const accessToken = typeof token === "string" ? token : token.accessToken;
    const key = getTokenCacheKey(token);
    let userinfo: Record<string, unknown> | undefined;

    try {
      userinfo = await this.store.getUserInfo(key, this.getId());
    } catch {
      debug("No userinfo cache found for key: %s", key);
    }

    if (!userinfo) {
      const openidClient = await getOpenIDClient();

      const configuration = await this.ensureConfiguration();

      // Access-token-only sessions lack an ID-token subject; preserve the existing check policy for both forms.
      userinfo = await openidClient.fetchUserInfo(configuration, accessToken, openidClient.skipSubjectCheck);

      try {
        await this.store.setUserInfo(key, userinfo, this.getId());
      } catch (e: any) {
        logger.warn({ message: e.message }, "Could not set userinfo cache: @{message}");
      }
    }
    return userinfo;
  }

  /**
   * Pick the username, subject and groups out of one claims source.
   *
   * Each source fills only what the other sources left empty, so the first
   * source that names the user wins and later sources only add the rest.
   */
  private pickIdentity(userinfo: Record<string, unknown>, into: Identity): void {
    const { usernameClaim, groupsClaim } = this.config;

    into.name ??= userinfo[usernameClaim];
    into.subject ??= userinfo.sub;

    if (groupsClaim) {
      into.groups ??= userinfo[groupsClaim];
    }
  }

  /**
   * Read the username and groups of a user through the configured claims.
   *
   * @param token the provider token
   * @returns the username and, when the claims carry any, the groups
   */
  async getUserinfo(token: OpenIDToken): Promise<ProviderUser> {
    const identity: Identity = {};

    if (typeof token !== "string") {
      // username and groups can be in the id_token if the scope is openid.
      try {
        this.pickIdentity(this.getUserinfoFromIdToken(token), identity);
      } catch {
        debug("Could not get userinfo from id_token. Trying userinfo endpoint...");
      }
    }

    if (!identity.name || !identity.groups) {
      // or we can get them from the userinfo endpoint.
      try {
        this.pickIdentity(await this.getUserinfoFromEndpoint(token), identity);
      } catch {
        debug("Could not get userinfo from userinfo endpoint.");
      }
    }

    if (!identity.name) {
      throw new Error(`Could not get username with claim: "${this.config.usernameClaim}"`);
    }

    // We prefer the groups from the providerType if it is set.
    let groups = identity.groups;
    const providerType = this.config.providerType;
    if (providerType) {
      groups = await this.getGroupsWithProviderType(token, providerType);
    }

    if (groups) {
      groups = Array.isArray(groups) ? groups.map(String) : [String(groups)];
    }

    return {
      name: String(identity.name),
      groups: groups as string[] | undefined,
      subject: typeof identity.subject === "string" ? identity.subject : undefined,
    };
  }

  /**
   * Read the user's groups from the cache, or fetch them from the provider.
   *
   * @param token the provider token
   * @param providerType the provider API to ask
   * @returns the groups the provider reports
   * @throws {ReferenceError} when the provider type has no group API
   */
  private async getGroupsWithProviderType(token: OpenIDToken, providerType: ProviderType): Promise<string[]> {
    const key = getTokenCacheKey(token);

    let groups: string[] | undefined;

    try {
      groups = await this.store.getUserGroups(key, this.getId());
    } catch {
      debug("No user groups cache found for key: %s", key);
    }

    if (groups) return groups;

    switch (providerType) {
      case ProviderType.Gitlab: {
        groups = await fetchGitlabGroups(this.config.providerHost, token, this.customFetch);
        break;
      }
      default: {
        throw new ReferenceError(ERRORS.PROVIDER_NOT_FOUND);
      }
    }

    try {
      await this.store.setUserGroups(key, groups, this.getId());
    } catch (e: any) {
      logger.warn({ message: e.message }, "Could not set user groups cache: @{message}");
    }

    return groups;
  }
}
