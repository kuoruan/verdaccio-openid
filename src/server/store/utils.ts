import { PENDING_TOKEN, STORE_VALUE_LABELS } from "./constants";
import { isObject, isUndefOrNull, isUndefined, safeJsonParse } from "@/utils";

import type { LoginResult, StoredValues, StoreKind, WebAuthnSession } from "./Store";

/** Largest key the DynamoDB and MongoDB backends accept, in bytes (defence in depth). */
const MAX_KEY_BYTES = 1024;

/** Largest value the DynamoDB and MongoDB backends accept, in bytes (defence in depth). */
const MAX_VALUE_BYTES = 64 * 1024;

/**
 * Reject an input larger than the backend accepts.
 *
 * @param backend the store name, used as the message prefix
 * @param label what the value is, e.g. `store key`
 * @param value the encoded input
 * @param max the limit, in bytes
 */
function assertSize(backend: string, label: string, value: string, max: number): void {
  if (Buffer.byteLength(value, "utf8") > max) {
    throw new Error(`${backend}: ${label} exceeds ${max} byte limit`);
  }
}

/**
 * Validate a value a database-backed store is about to write.
 *
 * @param backend the store name, used as the message prefix
 * @param kind the kind of value being stored
 * @param key the row key
 * @param value the value, or undefined when the row is removed
 */
export function validateStoredValue<K extends StoreKind>(
  backend: string,
  kind: K,
  key: string,
  value: StoredValues[K] | undefined,
): void {
  assertSize(backend, "store key", key, MAX_KEY_BYTES);
  if (isUndefined(value)) return;
  assertSize(
    backend,
    STORE_VALUE_LABELS[kind],
    typeof value === "string" ? value : JSON.stringify(value),
    MAX_VALUE_BYTES,
  );
}

/**
 * Map the raw stored token to the session it represents.
 *
 * @param raw the stored value, or null/undefined when there is none
 * @returns the session, or undefined when there is none
 */
export function toWebAuthnSession(raw: string | null | undefined): WebAuthnSession | undefined {
  if (isUndefOrNull(raw)) return undefined;

  return raw === PENDING_TOKEN ? { status: "pending" } : { status: "ready", token: raw };
}

/**
 * Parse the login result a store row holds.
 *
 * A row written by another version, or corrupted on disk, must not reach the
 * browser: it is reported as a miss instead of failing the exchange.
 *
 * @param raw the stored value, or null/undefined when there is none
 * @returns the credentials, or undefined when there is nothing usable
 */
export function parseLoginResult(raw: unknown): LoginResult | undefined {
  if (typeof raw !== "string") return undefined;

  const parsed = safeJsonParse(raw);

  const { username, uiToken, npmToken } = isObject(parsed) ? parsed : {};

  if (typeof username !== "string" || typeof uiToken !== "string" || typeof npmToken !== "string") {
    return undefined;
  }

  return { username, uiToken, npmToken };
}
