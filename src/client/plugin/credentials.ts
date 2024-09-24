//
// After a successful login we are redirected to the UI with our username
// and a JWT token. We need to save these in local storage so Verdaccio
// thinks we are logged in.
//

import { parseJwt } from "./lib";

export type Credentials = {
  username: string;
  uiToken: string;
  npmToken: string;
};

export function saveCredentials(credentials: Credentials) {
  // username and token are required for verdaccio to think we are logged in
  localStorage.setItem("username", credentials.username);
  localStorage.setItem("token", credentials.uiToken);
  localStorage.setItem("npm", credentials.npmToken);
}

export function clearCredentials() {
  localStorage.removeItem("username");
  localStorage.removeItem("token");
  localStorage.removeItem("npm");
}

export function isLoggedIn(): boolean {
  for (const key of ["username", "token", "npm"] as const) {
    if (!localStorage.getItem(key)) {
      return false;
    }
  }

  return true;
}

export function isTokenExpired() {
  const token = localStorage.getItem("token");
  if (!token) return true;

  const payload = parseJwt(token);
  if (!payload) return true;

  // Report as expired before (real expiry - 30s)
  const jsTimestamp = payload.exp * 1000 - 30_000;

  return Date.now() >= jsTimestamp;
}

export function validateCredentials(credentials: Partial<Credentials>): credentials is Credentials {
  for (const key of ["username", "uiToken", "npmToken"] as const) {
    if (!credentials[key]) {
      return false;
    }
  }

  return true;
}
