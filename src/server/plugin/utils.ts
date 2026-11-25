import { createHmac, timingSafeEqual } from "node:crypto";

import type { AllowAccess, PackageList } from "@verdaccio/types";
import { getPublicUrl } from "@verdaccio/url";
import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request, Response } from "express";
import { stableHash } from "stable-hash";

import { ERRORS, LOGIN_COOKIE_MAX_AGE_MS, LOGIN_COOKIE_NAMES } from "@/server/constants";

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

/**
 * Read a cookie from the request headers.
 *
 * @param req the request
 * @param name the cookie name
 * @returns the value, or undefined when the request does not carry it
 */
export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie;

  if (!header) return undefined;

  return parseCookieHeader(header)[name];
}

/**
 * Set a cookie on the response.
 *
 * This is the general cookie layer; the login helpers below add the attributes
 * and the expiry that a login binding needs.
 *
 * @param res the response to set the cookie on
 * @param name the cookie name
 * @param value the value to store
 * @param options the cookie attributes
 */
export function setCookie(res: Response, name: string, value: string, options: CookieOptions) {
  res.cookie(name, value, options);
}

/**
 * Clear a cookie on the response.
 *
 * This is the general cookie layer; the login helpers below strip the expiry
 * they added when setting the cookie.
 *
 * @param res the response to clear the cookie on
 * @param name the cookie name
 * @param options the cookie attributes it was set with
 */
export function clearCookie(res: Response, name: string, options: CookieOptions) {
  res.clearCookie(name, options);
}

/**
 * Attributes of the cookie that ties a login to the browser that started it.
 *
 * It is not readable from script, it travels only to this origin, and it is
 * `SameSite=Lax` so it comes back on the top-level redirect from the provider
 * but not on a request another site makes.
 *
 * It is kept for a fixed five minutes, which bounds how long the marker stays in
 * the browser. Whether the login can still be finished is decided by the store
 * entry behind it, not by this cookie.
 *
 * @param urlPrefix the Verdaccio URL prefix
 * @param req the request that started the login
 * @returns the cookie attributes
 */
function loginCookieOptions(urlPrefix: string, req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: getBaseUrl(urlPrefix, req, true).startsWith("https://"),
    path: "/",
    maxAge: LOGIN_COOKIE_MAX_AGE_MS,
  };
}

/** The login flows that bind themselves to the browser with a cookie. */
export type LoginCookieKind = keyof typeof LOGIN_COOKIE_NAMES;

/**
 * Mark the browser as the one that started this login.
 *
 * @param res the response to set the cookie on
 * @param req the request that started the login
 * @param urlPrefix the Verdaccio URL prefix
 * @param kind the login flow the cookie belongs to
 * @param value the login the browser may finish
 */
export function setLoginCookie(res: Response, req: Request, urlPrefix: string, kind: LoginCookieKind, value: string) {
  setCookie(res, LOGIN_COOKIE_NAMES[kind], value, loginCookieOptions(urlPrefix, req));
}

/**
 * Read the login the browser is allowed to finish.
 *
 * @param req the request that came back from the provider
 * @param kind the login flow the cookie belongs to
 * @returns the login, or undefined when this browser did not start it
 */
export function getLoginCookie(req: Request, kind: LoginCookieKind): string | undefined {
  return getCookie(req, LOGIN_COOKIE_NAMES[kind]);
}

/**
 * Forget the login the browser was allowed to finish.
 *
 * @param res the response to clear the cookie on
 * @param req the request that finished the login
 * @param urlPrefix the Verdaccio URL prefix
 * @param kind the login flow the cookie belongs to
 */
export function clearLoginCookie(res: Response, req: Request, urlPrefix: string, kind: LoginCookieKind) {
  // Express 4 (Verdaccio 5/6) merges these options as-is, so a lingering
  // maxAge would win over the expired date and the cookie would stay.
  const { maxAge: _maxAge, ...clearOptions } = loginCookieOptions(urlPrefix, req);

  clearCookie(res, LOGIN_COOKIE_NAMES[kind], clearOptions);
}
