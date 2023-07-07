import type { Request } from "express";

export interface AuthProvider {
  getId(): string;
  getLoginUrl(callbackUrl: string): string;
  getCode(req: Request): string;

  getToken(code: string, callbackUrl: string): Promise<string>;
  getUsername(providerToken: string): Promise<string>;
  getGroups(username: string, providerToken: string): Promise<string[]>;
}
