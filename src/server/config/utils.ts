import process from "node:process";

import { pluginKey } from "@/constants";
import logger from "@/server/logger";

/**
 * Get the value of an environment variable.
 *
 * @param name - The name of the environment variable.
 * @returns
 */
export function getEnvironmentValue(name: string): unknown {
  const value = process.env[name];

  if (value === undefined || value === null) return value;

  if (value === "true" || value === "false") {
    return value === "true";
  }

  try {
    const v = JSON.parse(value);

    // Only return the parsed value if it is an object.
    if (typeof v === "object" && v !== null) {
      return v;
    }
  } catch {
    // Do nothing
  }

  return value;
}

export function handleValidationError(error: any, ...keyPaths: string[]) {
  const message = error.errors ? error.errors[0] : error.message || error;
  logger.error(
    { key: ["auth", pluginKey, ...keyPaths].join("."), message },
    `invalid configuration at "@{key}": @{message} — Please check your verdaccio config.`,
  );
  process.exit(1);
}
