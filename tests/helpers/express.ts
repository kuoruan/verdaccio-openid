/**
 * The response object an Express handler receives, reduced to what the plugin's
 * handlers use, so a flow can be exercised without a server.
 */
import { parseSetCookie, serialize, type SetCookie } from "cookie";
import type { CookieOptions } from "express";
import { isUndefined } from "@/utils";

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  jsonBody: unknown;
  redirectedTo?: string;
  /** The cookies that were set, as `Set-Cookie` header values. */
  cookies: string[];
  /** The headers that were set, keyed by lowercase name. */
  headers: Record<string, string>;
  status(code: number): FakeResponse;
  send(body: unknown): FakeResponse;
  json(body: unknown): FakeResponse;
  redirect(url: string): FakeResponse;
  header(name: string, value: string): FakeResponse;
  cookie(name: string, value: string, options?: CookieOptions): FakeResponse;
  clearCookie(name: string, options?: CookieOptions): FakeResponse;
}

/**
 * Convert the options Express takes to the ones `cookie` serializes.
 *
 * Express counts `maxAge` in milliseconds and derives `expires` from it, while
 * `cookie` serializes `maxAge` as seconds.
 *
 * @param options the options passed to `res.cookie`
 * @returns the options for `cookie.serialize`
 */
function toCookieOptions(options: CookieOptions): CookieOptions {
  if (isUndefined(options.maxAge)) return options;

  const milliseconds = Number(options.maxAge);

  return {
    ...options,
    maxAge: Math.floor(milliseconds / 1000),
    expires: options.expires ?? new Date(Date.now() + milliseconds),
  };
}

/**
 * Build a response that records what the handler did.
 *
 * @returns the response
 */
export function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    jsonBody: undefined,
    redirectedTo: undefined,
    cookies: [],
    headers: {},

    header(name, value) {
      this.headers[name.toLowerCase()] = value;

      return this;
    },

    status(code) {
      this.statusCode = code;

      return this;
    },

    send(body) {
      this.body = body;

      return this;
    },

    json(body) {
      this.jsonBody = body;

      return this;
    },

    redirect(url) {
      this.redirectedTo = url;
      this.statusCode = 302;

      return this;
    },

    cookie(name, value, options = {}) {
      this.cookies.push(serialize(name, value, toCookieOptions(options)));

      return this;
    },

    clearCookie(name, options) {
      // What Express does: expire it, and never send a `Max-Age`.
      return this.cookie(name, "", { ...options, expires: new Date(1), maxAge: undefined });
    },
  };

  return res;
}

/**
 * The cookies of a response, keyed by name.
 *
 * Parsed with the `cookie` package, so a value that contains `=` or an escape
 * sequence is read the way the browser reads it.
 *
 * @param res the response
 * @returns every cookie it set, with its attributes parsed
 */
export function cookiesOf(res: FakeResponse): Record<string, SetCookie> {
  const cookies: Record<string, SetCookie> = {};

  for (const header of res.cookies) {
    const cookie = parseSetCookie(header);

    cookies[cookie.name] = cookie;
  }

  return cookies;
}
