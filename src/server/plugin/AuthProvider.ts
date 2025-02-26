import type { Request } from "express";

export enum ProviderType {
  Gitlab = "gitlab",
}

export interface AuthProvider {
  getId(): string;
  getLoginUrl(request: Request): Promise<string>;

  getToken(callbackRequest: Request): Promise<OpenIDToken>;
  getUserinfo(providerToken: OpenIDToken): Promise<ProviderUser>;
}

/**
 * When token is string, it is a access token
 */
export type OpenIDToken = string | TokenInfo;

export interface ProviderUser {
  groups?: string[];
  name: string;
}

export interface TokenInfo {
  accessToken: string;
  // We not use the expires_in field
  // because it is only accurate when the access token response is received
  expiresAt?: number;
  idToken?: string;
  subject?: string;
}
