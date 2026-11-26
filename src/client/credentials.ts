/**
 * The login redirect leaves a one-time code in the URL. The plugin exchanges
 * it, together with the session cookie, for the credentials and stores them
 * in `localStorage`, where Verdaccio reads the session.
 */
import { LOCAL_STORAGE_KEYS } from "@/client/constants";
import { AUTH_TOKEN_REGEX } from "@/constants";
import { isNull, safeJsonParse } from "@/utils";

/** A user name longer than this is a payload, not a name. */
const MAX_USERNAME_LENGTH = 256;

export interface Credentials {
  /** The name of the logged-in user. */
  username: string;
  /** Authenticates the user against the web UI. */
  uiToken: string;
  /** Authenticates the user against the registry. */
  npmToken: string;
}

/**
 * Store the credentials so the UI and the registry treat us as logged in.
 *
 * @param credentials the credentials to store
 */
export function saveCredentials(credentials: Credentials) {
  // The UI considers a session logged in once the username and the UI token are stored.
  const entries = [
    [LOCAL_STORAGE_KEYS.USERNAME, credentials.username],
    [LOCAL_STORAGE_KEYS.UI_TOKEN, credentials.uiToken],
    [LOCAL_STORAGE_KEYS.NPM_TOKEN, credentials.npmToken],
  ] as const;

  // A failed write must not leave half a session behind, and a previous
  // complete login must not be wiped by the rollback either.
  const previous = entries.map(([key]) => localStorage.getItem(key));

  try {
    for (const [key, value] of entries) {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    entries.forEach(([key], index) => {
      try {
        const old = previous[index];

        if (isNull(old)) localStorage.removeItem(key);
        else localStorage.setItem(key, old);
      } catch {
        // Storage is already failing; the original error is the useful one.
      }
    });

    throw error;
  }
}

/** Remove every stored credential. */
export function clearCredentials() {
  for (const key of Object.values(LOCAL_STORAGE_KEYS)) {
    localStorage.removeItem(key);
  }
}

/**
 * Check whether the UI will treat the session as logged in.
 *
 * @returns whether a username and a UI token are stored
 */
export function isLoggedIn(): boolean {
  return !!localStorage.getItem(LOCAL_STORAGE_KEYS.USERNAME) && !!localStorage.getItem(LOCAL_STORAGE_KEYS.UI_TOKEN);
}

/**
 * Check whether the session was created by OpenID Connect rather than by the
 * password login: only this plugin stores an npm token alongside the UI token.
 *
 * @returns whether all three credentials are stored
 */
export function isOpenIDLoggedIn(): boolean {
  return Object.values(LOCAL_STORAGE_KEYS).every((key) => !!localStorage.getItem(key));
}

/**
 * Read the stored npm token.
 *
 * @returns the token, or null when there is none
 */
export function getNPMToken(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_KEYS.NPM_TOKEN);
}

/**
 * Check whether the stored UI token is expired.
 *
 * @returns whether the token is missing, unreadable, or expired
 */
export function isUITokenExpired() {
  const token = localStorage.getItem(LOCAL_STORAGE_KEYS.UI_TOKEN);
  if (!token) return true;

  const payload = parseJwt(token);
  if (!payload || !Number.isFinite(payload.exp)) return true;

  // Treat the token as expired 30s before it really is, so a request cannot
  // start just before the expiry and fail just after it.
  const jsTimestamp = payload.exp * 1000 - 30_000;

  return Date.now() >= jsTimestamp;
}

/**
 * Decode the payload of a JWT without verifying it.
 *
 * Taken from https://stackoverflow.com/a/38552302/1935971.
 *
 * @param token the JWT
 * @returns the decoded payload, or null when the token cannot be decoded
 */
export function parseJwt(token: string): Record<string, any> | null {
  try {
    // JWT has 3 parts separated by ".", the payload is the base64url-encoded part in the middle
    const parts = token.split(".");
    if (parts.length < 3) return null;

    const base64Url = parts[1];
    if (!base64Url) return null;

    // base64url replaced '+' and '/' with '-' and '_', so we undo it here
    const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        // atob decoded the base64 string, but multi-byte characters (emojis for example)
        // are not decoded properly. For example, "🍀" looks like "ð\x9F\x8D\x80". The next
        // line converts bytes into URI-percent-encoded format, for example "%20" for space.
        // Lastly, the decodeURIComponent wrapping this can correctly get a UTF-8 string.
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );

    return safeJsonParse<Record<string, any>>(jsonPayload) ?? null;
  } catch {
    return null;
  }
}

/**
 * Check whether a set of credentials carries all three required values, and
 * whether the tokens look like tokens rather than arbitrary text.
 *
 * @param credentials the values read from the redirect
 * @returns whether the credentials can be stored and used
 */
export function isValidCredentials(credentials: Partial<Credentials>): credentials is Credentials {
  const { username, uiToken, npmToken } = credentials;

  return (
    !!username &&
    username.length <= MAX_USERNAME_LENGTH &&
    AUTH_TOKEN_REGEX.test(uiToken ?? "") &&
    AUTH_TOKEN_REGEX.test(npmToken ?? "")
  );
}
