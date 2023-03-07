import { Token } from "./AuthProvider";

/**
 * Encode a string to base64
 *
 * @param str
 * @returns
 */
export function base64Encode(str: string): string {
  if (Buffer.isEncoding("base64url")) {
    return Buffer.from(str, "utf8").toString("base64url");
  }
  return Buffer.from(str, "utf8").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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

  return base64Encode(JSON.stringify(token)).slice(0, 16);
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
