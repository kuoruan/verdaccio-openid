import type { Request } from "express";

export interface TokenInfo {
  /** The `sub` claim of the token response. */
  subject?: string;
  accessToken: string;
  idToken?: string;
  /** Seconds since the epoch. */
  // `expires_in` from the token response is not used: it is only accurate at
  // the moment that response is received.
  expiresAt?: number;
}

/** Either the full token response, or just its access token. */
export type OpenIDToken = TokenInfo | string;

export interface ProviderUser {
  name: string;
  groups?: string[];
}

export enum ProviderType {
  Gitlab = "gitlab",
}

/** The OpenID provider operations the plugin needs. */
export interface AuthProvider {
  /** The provider id used to namespace the stored state. */
  getId(): string;

  /**
   * Build the URL that sends the user to the provider, storing the state it
   * carries so the callback can be checked against it.
   *
   * @param redirectUrl where the provider sends the user back to
   * @param customState state to use instead of a random one
   */
  getLoginUrl(redirectUrl: string, customState?: string): Promise<string>;

  /**
   * Exchange the authorization code in a callback request for tokens.
   *
   * @param callbackRequest the request the provider redirected to
   */
  getToken(callbackRequest: Request): Promise<OpenIDToken>;

  /**
   * Read the username and groups of the user a token belongs to.
   *
   * @param providerToken the token obtained for that user
   */
  getUserinfo(providerToken: OpenIDToken): Promise<ProviderUser>;
}
