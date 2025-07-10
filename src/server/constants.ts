import { fileURLToPath } from "node:url";

import { pluginKey } from "@/constants";

export const staticPath = `/-/static/${pluginKey}`;
export const publicRoot = fileURLToPath(new URL("../client", import.meta.url));

export const CONFIG_ENV_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const ERRORS = {
  INVALID_TOKEN: "Invalid token format",
  INVALID_ID_TOKEN: "Invalid id token",
  TOKEN_ENCRYPTION_FAILED_NPM: "Internal server error, failed to encrypt npm token",
  TOKEN_ENCRYPTION_FAILED: "Internal server error, failed to encrypt token",
  AUTH_NOT_INITIALIZED: "Unexpected error, auth is not initialized",
  CLIENT_NOT_DISCOVERED: "Client has not yet been discovered",
  PROVIDER_HOST_NOT_SET: "Provider host is not set",
  NO_STATE: "No state provided in the request",
  STATE_NOT_FOUND: "The state does not match a known state",
  NO_ACCESS_TOKEN_RETURNED: `No "access_token" was returned from the provider`,
  NO_ID_TOKEN_RETURNED: `"openid" scope is requested but no "id_token" was returned from the provider`,
  ID_TOKEN_NOT_FOUND: "No id_token found in the tokens",
  PROVIDER_NOT_FOUND: "Provider not found",
} as const;
