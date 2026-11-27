import { STORE_VALUE_LABELS } from "./constants";
import { isUndefined } from "@/utils";

import type { StoredValues, StoreKind } from "./Store";

/** Largest key the DynamoDB and MongoDB backends accept, in bytes (defence in depth). */
const MAX_KEY_BYTES = 1024;

/** Largest value the DynamoDB and MongoDB backends accept, in bytes (defence in depth). */
const MAX_VALUE_BYTES = 64 * 1024;

/** Whether a kind holds cached provider data, which shares the data TTL. */
export function isDataKind(kind: StoreKind): kind is "userInfo" | "userGroups" {
  return kind === "userInfo" || kind === "userGroups";
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
  if (Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES) {
    throw new Error(`${backend}: store key exceeds ${MAX_KEY_BYTES} byte limit`);
  }

  if (isUndefined(value)) return;

  const encoded = typeof value === "string" ? value : JSON.stringify(value);

  if (Buffer.byteLength(encoded, "utf8") > MAX_VALUE_BYTES) {
    throw new Error(`${backend}: ${STORE_VALUE_LABELS[kind]} exceeds ${MAX_VALUE_BYTES} byte limit`);
  }
}
