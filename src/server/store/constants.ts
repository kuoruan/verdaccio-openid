import type { StoreKind } from "./Store";

/** How long the stores keep authorization state: the nonce, the WebAuthn token, the login result. */
export const DEFAULT_STATE_TTL_MS = 60 * 1000;

/** How long the stores keep the user info and groups caches. */
export const DEFAULT_DATA_TTL_MS = 5 * 60 * 1000;

/**
 * Marker stored while a WebAuthn login waits for the browser.
 *
 * Only the store backends use it; the flows see a `pending` session instead.
 */
export const PENDING_TOKEN = "__pending__";

/** Store namespace of the credentials a web login hands to the browser. */
export const loginResultNamespace = "openid-login";

/**
 * The field the document stores keep each kind's value under.
 *
 * Shared by the DynamoDB and MongoDB backends, whose rows have the same shape.
 */
export const ROW_FIELD: Record<StoreKind, "nonce" | "data" | "groups" | "token" | "value"> = {
  state: "nonce",
  userInfo: "data",
  userGroups: "groups",
  webAuthn: "token",
  loginResult: "value",
};

/**
 * Size-check labels for the stored value of each kind, used by the
 * DynamoDB and MongoDB backends in `validate`.
 */
export const STORE_VALUE_LABELS: Record<StoreKind, string> = {
  state: "openid state nonce",
  userInfo: "user info payload",
  userGroups: "user groups payload",
  webAuthn: "webauthn token",
  loginResult: "login result",
};
