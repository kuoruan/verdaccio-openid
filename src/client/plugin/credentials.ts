/**
 * The login redirect brings the username and the tokens back to the UI as query
 * parameters. Verdaccio reads the session from `localStorage`, so the plugin
 * stores them there.
 */
import { LOCAL_STORAGE_KEYS } from "@/client/constants";
import { parseJwt } from "./lib";

/**
 * A token is a JWT or base64url string, so nothing outside this set can be one.
 * The set also keeps shell metacharacters out of the command the usage info
 * shows, which is meant to be copied and pasted; the length bound keeps a link
 * from stuffing storage.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_\-+/=.]{1,4096}$/;
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
  localStorage.setItem(LOCAL_STORAGE_KEYS.USERNAME, credentials.username);
  localStorage.setItem(LOCAL_STORAGE_KEYS.UI_TOKEN, credentials.uiToken);
  localStorage.setItem(LOCAL_STORAGE_KEYS.NPM_TOKEN, credentials.npmToken);
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
    TOKEN_PATTERN.test(uiToken ?? "") &&
    TOKEN_PATTERN.test(npmToken ?? "")
  );
}
