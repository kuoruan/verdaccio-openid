/**
 * Encoding, signing and token helpers shared by the server code.
 *
 * Nothing here touches Express or Verdaccio: these are pure functions over
 * strings, keyed by the plugin secret.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { stableHash } from "stable-hash";

import { ERRORS } from "@/server/constants";

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
