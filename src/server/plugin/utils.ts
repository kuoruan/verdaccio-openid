import type { PackageList } from "@verdaccio/types";
import { getPublicUrl, type RequestOptions } from "@verdaccio/url";
import type { Request } from "express";
import { stableHash } from "stable-hash";

import { ERRORS } from "@/server/constants";

/**
 * Get all permission groups used in the Verdacio config.
 *
 * @param packages The package list.
 * @returns The configured groups.
 */
export function getAllConfiguredGroups(packages: PackageList = {}): string[] {
  const groups = Object.values(packages).flatMap((packageConfig) => {
    return (["access", "publish", "unpublish"] as const).flatMap((key) => packageConfig[key] ?? []).filter(Boolean);
  });

  return [...new Set(groups)];
}

/**
 * Get the authenticated groups configured in the Verdaccio config.
 *
 * @param val The value to check.
 * @returns The authenticated groups.
 */
export function getAuthenticatedGroups(val?: unknown): string[] | boolean {
  switch (typeof val) {
    case "boolean": {
      return val;
    }
    case "string": {
      return [val].filter(Boolean);
    }
    case "object": {
      return Array.isArray(val) ? val.filter(Boolean) : false;
    }
    default: {
      return false;
    }
  }
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
 * Decode a base64 string
 *
 * @param str
 * @returns
 */
export function base64Decode(str: string): string {
  return Buffer.from(str, "base64").toString("utf8");
}

/**
 * Get hash of any object
 *
 * @param obj
 * @returns {string}
 */
export function hashObject(obj: any): string {
  if (typeof obj === "string") return obj;

  return stableHash(obj);
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
    throw new TypeError(ERRORS.INVALID_ID_TOKEN);
  }

  return JSON.parse(base64Decode(splits[1])) as Record<string, unknown>;
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
