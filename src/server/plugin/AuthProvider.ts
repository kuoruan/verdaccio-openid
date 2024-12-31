import type { Request } from "express";

export interface TokenInfo {
  subject?: string;
  accessToken: string;
  idToken?: string;
  // We not use the expires_in field
  // because it is only accurate when the access token response is received
  expiresAt?: number;
}

// when token is string, it is a access token
export type OpenIDToken = TokenInfo | string;

export interface ProviderUser {
  name: string;
  groups?: string[];
}

export enum ProviderType {
  Gitlab = "gitlab",
}

export interface AuthProvider {
  getId(): string;
  getLoginUrl(request: Request): Promise<string>;

  getToken(callbackRequest: Request): Promise<OpenIDToken>;
  getUserinfo(providerToken: OpenIDToken): Promise<ProviderUser>;
}
