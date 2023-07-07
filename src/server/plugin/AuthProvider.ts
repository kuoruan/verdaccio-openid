import type { Request } from "express";

import { PackageAccess } from "./Config";

export interface ConfigHolder {
  providerHost: string;
  providerType?: string;
  issuer?: string;
  configurationUri?: string;
  scope: string;
  usernameClaim: string;
  groupsClaim?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  clientId: string;
  clientSecret: string;
  urlPrefix: string;
  packages: Record<string, PackageAccess>;
}

export type TokenSet = {
  accessToken: string;
  idToken?: string;
  // We not use the expires_in field
  // because it is only accurate when the access token response is received
  expiresAt?: number;
};

// when token is string, it is a access token
export type Token = TokenSet | string;

export type ProviderUser = {
  name: string;
  groups?: string[];
};

export interface AuthProvider {
  getId(): string;
  getLoginUrl(request: Request): string;

  getToken(callbackRequest: Request): Promise<Token>;
  getUserinfo(providerToken: Token): Promise<ProviderUser>;
}
