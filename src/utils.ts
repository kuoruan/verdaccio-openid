/**
 * Pure helpers shared by the server, the CLI and the browser: no Express, no
 * Verdaccio, no network.
 */

/** The characters HTML special characters are replaced with. */
const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** A path this site serves cannot carry a backslash or a control character. */
// oxlint-disable-next-line no-control-regex
const UNSAFE_PATH = /[\\\u0000-\u001F\u007F]/;

/**
 * Escape a value before it is inserted into HTML.
 *
 * @param value the value to escape
 * @returns the value with the HTML special characters replaced
 */
export function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/g, (character) => htmlEntities[character]);
}

/**
 * Normalize a link target to one that cannot run script or leave this site.
 *
 * The value reaches an `href` attribute, so it is restricted to a path on this
 * site or to an absolute `http`/`https` URL, then escaped.
 *
 * @param backUrl the target to normalize
 * @param fallback the target to use when the value is not a usable link
 * @returns the escaped target, or the fallback unchanged when the target is invalid
 */
export function safeUrl(backUrl: string, fallback = "/"): string {
  const value = backUrl.trim();

  // Browsers turn `\` into `/`, so `/<host>` would become `//<host>`: a value
  // that looks like a path must not be able to leave this site. A control
  // character can hide that rewrite just as well.
  if (value.startsWith("/") && !value.startsWith("//") && !UNSAFE_PATH.test(value)) {
    return escapeHtml(value);
  }

  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return escapeHtml(value);
    }
  } catch {
    // Not an absolute URL, and not a relative path either.
  }

  return fallback;
}

/**
 * Parse JSON without throwing: a failure is reported as undefined.
 *
 * The parsed value is returned as-is (objects, arrays, scalars and null
 * included); callers keep their own shape checks and error policies. A type
 * argument describes the expected value but does not validate its shape.
 *
 * @template T the expected type of the parsed value
 * @param raw the JSON text
 * @returns the parsed value, or undefined when it is not valid JSON
 */
export function safeJsonParse<T = unknown>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Serialize a value as JSON without throwing: a failure is reported as undefined.
 *
 * The counterpart of `safeJsonParse` for the write side. It is only used by
 * the store's own row encoding; a value that holds no JSON form is a bug in
 * the caller, not a reason to fail the whole exchange silently.
 *
 * @param value the value to serialize
 * @returns the JSON text, or undefined when the value has no JSON form
 */
export function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Check whether a value is `undefined`.
 *
 * @param value the value to check
 * @returns whether the value is `undefined`
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Check whether a value is `null`.
 *
 * @param value the value to check
 * @returns whether the value is `null`
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Check whether a value is a non-null object, including arrays.
 *
 * @template T the object type to preserve when narrowing
 * @param value the value to check
 * @returns whether the value is an object
 */
export function isObject<T extends object>(
  value: T | string | number | boolean | bigint | symbol | null | undefined,
): value is T;
/**
 * Check whether a value is a non-null object, including arrays.
 *
 * @param value the value to check
 * @returns whether the value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown>;
export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * Check whether a value is a string containing more than whitespace.
 *
 * @param value the value to check
 * @returns whether the value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Check whether a value is an array whose entries are all strings.
 *
 * @param value the value to check
 * @returns whether the value is an array of strings
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Check whether a value is `null` or `undefined`.
 *
 * @param value the value to check
 * @returns whether the value is `null` or `undefined`
 */
export function isUndefOrNull(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Hide the credentials a proxy URL may carry.
 *
 * The value is written to the log, where a password must not end up.
 *
 * @param value the proxy URL as configured
 * @returns the value with its password hidden, or "***" for an unreadable value containing "@"
 */
export function redactUrlCredentials(value: string): string {
  try {
    const url = new URL(value);

    // Without a host the value is not a URL this code can read safely:
    // `user:s3cret@proxy` parses with `user:` as its scheme.
    if (url.host === "") throw new Error("not a proxy URL");

    if (url.password) {
      url.password = "***";

      return url.toString();
    }

    // A user name without a password is not a secret, and an `@` elsewhere
    // (path, query) is not a credential either.
    return value;
  } catch {
    // Not a URL: nothing safe can be picked out of it, so only say it is set.
    return value.includes("@") ? "***" : value;
  }
}
