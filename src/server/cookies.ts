/**
 * Cookie helpers for the server side.
 *
 * `getCookie`, `setCookie` and `clearCookie` are the general layer. The login
 * helpers above them add the attributes and the expiry a login binding needs.
 */
import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request, Response } from "express";

import { LOGIN_COOKIE_MAX_AGE_MS, LOGIN_COOKIE_NAMES } from "@/server/constants";
import { getBaseUrl } from "@/server/plugin/utils";

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
