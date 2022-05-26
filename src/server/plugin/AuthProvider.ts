import type { Request } from "express";

export interface AuthProvider {
  getId(): string;
  getLoginUrl(req: Request): string;

  getToken(callbackReq: Request): Promise<string>;
  getUsername(providerToken: string): Promise<string>;
  getGroups(username: string, providerToken?: string): Promise<string[]>;
}
