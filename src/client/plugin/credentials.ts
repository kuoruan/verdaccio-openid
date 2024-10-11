//
// After a successful login we are redirected to the UI with our username
// and a JWT token. We need to save these in local storage so Verdaccio
// thinks we are logged in.
//

import { parseJwt } from "./lib";

export interface Credentials {
  username: string;
  uiToken: string;
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

export function isLoggedIn(): boolean {
  return Object.values(LOCAL_STORAGE_KEYS).every((key) => !!localStorage.getItem(key));
}

export function getNPMToken(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_KEYS.NPM_TOKEN);
}

export function isUITokenExpired() {
  const token = localStorage.getItem(LOCAL_STORAGE_KEYS.UI_TOKEN);
  if (!token) return true;

  const payload = parseJwt(token);
  if (!payload) return true;

  // Report as expired before (real expiry - 30s)
  const jsTimestamp = payload.exp * 1000 - 30_000;

  return Date.now() >= jsTimestamp;
}

export function validateCredentials(credentials: Partial<Credentials>): credentials is Credentials {
  return (["username", "uiToken", "npmToken"] satisfies (keyof Credentials)[]).every((key) => !!credentials[key]);
}
