import { createHash } from "node:crypto";

import { getPublicUrl, type RequestOptions } from "@verdaccio/url";
import type { Request } from "express";

import type { Token } from "./AuthProvider";

/**
 * Encode a string to base64
 *
 * @param str
 * @returns
 */
export function base64Encode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

/**
 * Decode a base64 string
 *
 * @param str
 * @returns
 */
export function base64Decode(str: string): string {
  return Buffer.from(str, "base64").toString("utf8");
}

/**
 * Get a hash of the token
 *
 * @param token
 * @returns {string}
 */
export function hashToken(token: Token): string {
  if (typeof token === "string") return token;

  const str = JSON.stringify(token);

  return createHash("sha256").update(str).digest("hex");
}

/**
 * Get the access token from the token set
 *
 * @param token
 * @returns {string}
 */
export function extractAccessToken(token: Token): string {
  if (typeof token === "string") return token;

  return token.accessToken;
}

/**
 * Get the claims from the id token
 *
 * @param idToken
 * @returns
 */
export function getClaimsFromIdToken(idToken: string): Record<string, unknown> {
  const splits = idToken.split(".");
  if (splits.length !== 3) {
    throw new TypeError("Invalid id token");
  }

  return JSON.parse(base64Decode(splits[1]));
}

/**
 * Check if the current time is before the expireAt time
 *
 * @param expireAt
 * @returns
 */
export function isNowBefore(expireAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now < expireAt;
}

/**
 * Get the base url from the request
 *
 * @param urlPrefix The url prefix.
 * @param req The request.
 * @param noTrailingSlash Whether to include a trailing slash.
 * @returns
 */
export function getBaseUrl(urlPrefix: string, req: Request, noTrailingSlash = false): string {
  const headers: Record<string, string> = {};

  // transform headers value to string
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = value?.toString() ?? "";
  }

  const options: RequestOptions = { host: req.hostname, protocol: req.protocol, remoteAddress: req.ip, headers };

  const base = getPublicUrl(urlPrefix, options);

  return noTrailingSlash ? base.replace(/\/$/, "") : base;
}
