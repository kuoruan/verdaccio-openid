import type { Request } from "express";

import { PackageAccess } from "./Config";

export interface ConfigHolder {
  providerHost: string;
  providerType?: string;
  issuer?: string;
  configurationUri?: string;
  scope?: string;
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

export interface AuthProvider {
  getId(): string;
  getLoginUrl(req: Request): string;

  getToken(callbackReq: Request): Promise<string>;
  getUsername(providerToken: string): Promise<string>;
  getGroups(providerToken: string): Promise<string[]>;
}
