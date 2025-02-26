import type { Request } from "express";

import { getPublicUrl, type RequestOptions } from "@verdaccio/url";
import { createHash } from "node:crypto";

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
 * Encode a string to base64
 *
 * @param str
 * @returns
 */
export function base64Encode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
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

  const options: RequestOptions = { headers, host: req.hostname, protocol: req.protocol, remoteAddress: req.ip };

  const base = getPublicUrl(urlPrefix, options);

  return noTrailingSlash ? base.replace(/\/$/, "") : base;
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

  return JSON.parse(base64Decode(splits[1])) as Record<string, unknown>;
}

/**
 * Get hash of any object
 *
 * @param obj
 * @returns {string}
 */
export function hashObject(obj: any): string {
  if (typeof obj === "string") return obj;

  const str = JSON.stringify(obj);

  return createHash("sha256").update(str).digest("hex");
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
