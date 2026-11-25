import { fileURLToPath } from "node:url";

import { pluginKey } from "@/constants";

export const staticPath = `/-/static/${pluginKey}`;
export const publicRoot = fileURLToPath(new URL("../client", import.meta.url));

// for Verdaccio <= 6.4, we patch the HTML at a known variable
export const VERDACCIO_BASENAME_UI_OPTIONS_MARKER = "__VERDACCIO_BASENAME_UI_OPTIONS";
// for Verdaccio >= 6.5, we patch the HTML at a known script tag that includes ui-options.js
export const VERDACCIO_UI_OPTIONS_SCRIPT_MARKER = "ui-options.js";

export const CONFIG_ENV_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Cookies that bind each login flow to the browser that started it.
 *
 * The UI and npm flows keep separate names so a login started in one does not
 * overwrite the binding of a login started in the other. The prefix is the
 * package, not the full `verdaccio-openid-` name, to keep the header small.
 */
export const LOGIN_COOKIE_NAMES = {
  ui: "openid-login-ui",
  npm: "openid-login-npm",
} as const;

/**
 * How long the browser keeps the cookie that binds a login to it, in milliseconds.
 *
 * It bounds how long that marker stays in the browser, not how long the login
 * can be finished: the store decides that, independently.
 */
export const LOGIN_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

export const ERRORS = {
  INVALID_TOKEN: "Invalid token format",
  INVALID_ID_TOKEN: "Invalid ID token",
  TOKEN_ENCRYPTION_FAILED_NPM: "Internal server error, failed to encrypt npm token",
  TOKEN_ENCRYPTION_FAILED: "Internal server error, failed to encrypt token",
  AUTH_NOT_INITIALIZED: "Unexpected error, auth is not initialized",
  CONFIGURATION_DISCOVERY_FAILED: "Could not discover OpenID configuration",
  CONFIGURATION_DISCOVERY_RETRY_LATER: "OpenID configuration discovery is cooling down after a recent failure",
  PROVIDER_HOST_NOT_SET: "Provider host is not set",
  NO_STATE: "No state provided in the request",
  STATE_NOT_FOUND: "The login state is unknown, already used, or expired",
  NO_ACCESS_TOKEN_RETURNED: `No "access_token" was returned from the provider`,
  NO_ID_TOKEN_RETURNED: `"openid" scope is requested but no "id_token" was returned from the provider`,
  ID_TOKEN_NOT_FOUND: "No id_token found in the tokens",
  PROVIDER_NOT_FOUND: "Provider not found",
  NO_CLAIMS_FOUND: "No claims found in the token response",
} as const;
