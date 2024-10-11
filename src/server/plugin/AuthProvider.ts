import type { Request } from "express";

export interface TokenSet {
  accessToken: string;
  idToken?: string;
  // We not use the expires_in field
  // because it is only accurate when the access token response is received
  expiresAt?: number;
}

// when token is string, it is a access token
export type Token = TokenSet | string;

export interface ProviderUser {
  name: string;
  groups?: string[];
}

export interface AuthProvider {
  getId(): string;
  getLoginUrl(request: Request): string;

  getToken(callbackRequest: Request): Promise<Token>;
  getUserinfo(providerToken: Token): Promise<ProviderUser>;
}
