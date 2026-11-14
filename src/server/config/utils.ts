import path from "node:path";
import process from "node:process";

import ms, { type StringValue } from "ms";

import { pluginKey } from "@/constants";
import logger from "@/server/logger";

/**
 * Read an environment variable and parse booleans, JSON objects and JSON arrays.
 *
 * @param name the name of the environment variable
 * @returns the parsed value, the raw string, or undefined when the variable is not set
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

export function handleValidationError(error: any, ...keyPaths: string[]): never {
  const message = error.errors ? error.errors[0] : (error.message ?? error);
  logger.error(
    { key: ["auth", pluginKey, ...keyPaths].join("."), message },
    `Invalid configuration at "@{key}": @{message}. Check the Verdaccio config.`,
  );
  process.exit(1);
}

/**
 * Convert a duration such as `"5m"` to milliseconds.
 *
 * @param ttl the duration as a number of milliseconds or a string like `"1m"`
 * @returns the duration in milliseconds, or undefined when none was given
 */
export function getTTLValue(ttl?: number | string): number | undefined {
  if (typeof ttl === "string") {
    return ms(ttl as StringValue);
  }

  return ttl;
}

/**
 * Resolve the store path relative to the directory holding the config file.
 *
 * @param configPath the path of the Verdaccio config file
 * @param storePath the `dir` of the file store, absolute or relative
 * @returns the absolute path of the store
 */
export function getStoreFilePath(configPath: string, storePath: string): string {
  return path.isAbsolute(storePath) ? storePath : path.normalize(path.join(path.dirname(configPath), storePath));
}
