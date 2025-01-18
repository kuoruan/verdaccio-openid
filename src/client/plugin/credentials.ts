//
// After a successful login we are redirected to the UI with our username
// and a JWT token. We need to save these in local storage so Verdaccio
// thinks we are logged in.
//

import { parseJwt } from "./lib";

export interface Credentials {
  // The logged in username
  username: string;
  // UI token is used to authenticate with the UI
  uiToken: string;
  // NPM token is used to authenticate with the registry
  npmToken: string;
}

const LOCAL_STORAGE_KEYS = {
  USERNAME: "username",
  UI_TOKEN: "token",
  NPM_TOKEN: "npm",
} as const;

export function saveCredentials(credentials: Credentials) {
  // username and ui token are required for verdaccio to think we are logged in
  localStorage.setItem(LOCAL_STORAGE_KEYS.USERNAME, credentials.username);
  localStorage.setItem(LOCAL_STORAGE_KEYS.UI_TOKEN, credentials.uiToken);
  localStorage.setItem(LOCAL_STORAGE_KEYS.NPM_TOKEN, credentials.npmToken);
}

export function clearCredentials() {
  for (const key of Object.values(LOCAL_STORAGE_KEYS)) {
    localStorage.removeItem(key);
  }
}

/**
 * Check if the user is logged in.
 *
 * This function checks if the user is logged in with the UI token.
 *
 * @returns {boolean} True if the user is logged in
 */
export function isLoggedIn(): boolean {
  return !!localStorage.getItem(LOCAL_STORAGE_KEYS.USERNAME) && !!localStorage.getItem(LOCAL_STORAGE_KEYS.UI_TOKEN);
}

/**
 * Check if the user is logged in with OpenID Connect
 *
 * @returns {boolean} True if the user is logged in with OpenID Connect
 */
export function isOpenIDLoggedIn(): boolean {
  return Object.values(LOCAL_STORAGE_KEYS).every((key) => !!localStorage.getItem(key));
}

/**
 * Get the NPM token from local storage
 *
 * @returns {string | null} The NPM token or null if it doesn't exist
 */
export function getNPMToken(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_KEYS.NPM_TOKEN);
}

/**
 * Check if the UI token is expired
 *
 * @returns {boolean} True if the UI token is expired
 */
export function isUITokenExpired() {
  const token = localStorage.getItem(LOCAL_STORAGE_KEYS.UI_TOKEN);
  if (!token) return true;

  const payload = parseJwt(token);
  if (!payload) return true;

  // Report as expired before (real expiry - 30s)
  const jsTimestamp = payload.exp * 1000 - 30_000;

  return Date.now() >= jsTimestamp;
}

/**
 * Validate the credentials object to ensure it has the required fields
 *
 * @param credentials The credentials object to validate
 * @returns {boolean} True if the credentials object is valid
 */
export function validateCredentials(credentials: Partial<Credentials>): credentials is Credentials {
  return (["username", "uiToken", "npmToken"] satisfies (keyof Credentials)[]).every((key) => !!credentials[key]);
}
