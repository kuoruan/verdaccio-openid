import { pluginKey } from "@/constants";
import logger from "@/server/logger";
import ms from "ms";
import path from "node:path";
import process from "node:process";

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

/**
 * Get the absolute path of a store file.
 *
 * @param configPath - The path to the config file.
 * @param storePath - The path to the store files.
 * @returns The absolute path of the store file.
 */
export function getStoreFilePath(configPath: string, storePath: string): string {
  return path.isAbsolute(storePath) ? storePath : path.normalize(path.join(path.dirname(configPath), storePath));
}

/**
 * Transform a time string or number into a ms number.
 *
 * @param ttl - The time to live value.
 * @returns The time to live value in ms.
 */
export function getTTLValue(ttl?: number | string): number | undefined {
  if (typeof ttl === "string") {
    return ms(ttl);
  }

  return ttl;
}

export function handleValidationError(error: any, ...keyPaths: string[]): never {
  const message = error.errors ? error.errors[0] : error.message || error;
  logger.error(
    { key: ["auth", pluginKey, ...keyPaths].join("."), message },
    `invalid configuration at "@{key}": @{message} — Please check your verdaccio config.`,
  );
  process.exit(1);
}
