import { createHmac, timingSafeEqual } from "node:crypto";

import type { AllowAccess, PackageList } from "@verdaccio/types";
import { getPublicUrl } from "@verdaccio/url";
import type { Request } from "express";
import { stableHash } from "stable-hash";

import { ERRORS } from "@/server/constants";

/**
 * Collect every permission group named in the Verdaccio package config.
 *
 * @param packages The package list.
 * @returns The configured groups.
 */
export function getAllConfiguredGroups(packages: PackageList = {}): string[] {
  const groups = Object.values(packages).flatMap((packageConfig) => {
    return (["access", "publish", "unpublish"] as const)
      .flatMap((key) => {
        const v = packageConfig[key];

        if (typeof v === "string") {
          return [v];
        }
        if (Array.isArray(v)) {
          return v;
        }
        return [];
      })
      .filter(Boolean);
  });

  return [...new Set(groups)];
}

/**
 * Normalize `authorized-groups` into the form the auth checks use.
 *
 * @param val the `authorized-groups` value: boolean, single group, or list
 * @returns the groups to require, or a boolean when the config asks for no or any group
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
 * Encode a string as base64url.
 *
 * @param str the string to encode
 * @returns the encoded string
 */
export function base64Encode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

/**
 * Decode a base64 or base64url string.
 *
 * @param str the string to decode
 * @returns the decoded string
 */
export function base64Decode(str: string): string {
  return Buffer.from(str, "base64").toString("utf8");
}

/**
 * Sign a string with HMAC-SHA256.
 *
 * @param value the string to sign
 * @param secret the key to sign it with
 * @returns the signature, as base64url
 */
export function signHmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/**
 * Compare a signature with the one the same value and secret produce.
 *
 * @param value the signed string
 * @param signature the signature to check
 * @param secret the key both signatures use
 * @returns whether the signature belongs to the value
 */
export function verifyHmac(value: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signHmac(value, secret), "base64url");
  const actual = Buffer.from(signature, "base64url");

  // `timingSafeEqual` throws when the lengths differ, so compare the lengths first.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Hash a value to use as a cache key, returning strings unchanged.
 *
 * @param obj the value to hash
 * @returns the string itself, or a stable hash of the value
 */
export function hashObject(obj: any): string {
  if (typeof obj === "string") return obj;

  return stableHash(obj);
}

/**
 * Read the claims of an ID token without verifying it.
 *
 * @param idToken the token to read
 * @returns the decoded claims
 * @throws {TypeError} when the token does not have three dot-separated parts
 */
export function getClaimsFromIdToken(idToken: string): Record<string, unknown> {
  const splits = idToken.split(".");
  if (splits.length !== 3) {
    throw new TypeError(ERRORS.INVALID_ID_TOKEN);
  }

  return JSON.parse(base64Decode(splits[1])) as Record<string, unknown>;
}

/**
 * Check whether the current time is before an expiry timestamp.
 *
 * @param expireAt the expiry as seconds since the epoch
 * @returns whether now is still before it
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
 * @param noTrailingSlash whether to strip the trailing slash
 * @returns the base URL, with a trailing slash unless `noTrailingSlash` is set
 */
export function getBaseUrl(urlPrefix: string, req: Request, noTrailingSlash = false): string {
  const base = getPublicUrl(urlPrefix, req);

  return noTrailingSlash ? base.replace(/\/$/, "") : base;
}

/**
 * Construct the full absolute URL for the current request, correctly handling
 * the url_prefix regardless of whether a reverse proxy strips it from req.url.
 *
 * When a reverse proxy (e.g. nginx) strips the url_prefix from the path, req.url
 * does not contain it — we concatenate baseUrl + req.url to add it back. When no
 * proxy is present, req.url already includes the prefix — we use `new URL(path, base)`
 * resolution to avoid duplicating it.
 *
 * @param urlPrefix The url prefix.
 * @param req The request.
 * @returns The full absolute URL of the current request.
 */
export function getFullUrl(urlPrefix: string, req: Request): URL {
  const baseUrl = getBaseUrl(urlPrefix, req, true);
  const reqPath = req.url;

  // Normalize the prefix (strip trailing slashes) to avoid two edge cases:
  // 1. `/prefix/` does not match `reqPath = "/prefix"` (trailing slash mismatch)
  // 2. `/prefix` incorrectly matches `reqPath = "/prefix-other"` (substring match)
  const cleanPrefix = urlPrefix.replace(/\/+$/, "");

  const hasPrefix = !!(cleanPrefix && (reqPath === cleanPrefix || reqPath.startsWith(cleanPrefix + "/")));

  return hasPrefix ? new URL(reqPath, baseUrl) : new URL(baseUrl + reqPath);
}

/**
 * Build the specifier npm uses for a package: `name@version`, `name@tag`, or just the name.
 *
 * @param pkg the package asked for
 * @returns the specifier in the form npm expects
 */
export function getPackageSpec(pkg: AllowAccess): string {
  if (pkg.version) {
    return `${pkg.name}@${pkg.version}`;
  }

  if (pkg.tag) {
    return `${pkg.name}@${pkg.tag}`;
  }

  return pkg.name;
}
