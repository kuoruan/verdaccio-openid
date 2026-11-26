import path from "node:path";
import process from "node:process";

import ms, { type StringValue } from "ms";

import { pluginKey } from "@/constants";
import { CONFIG_ENV_NAME_REGEX } from "@/server/constants";
import logger from "@/server/logger";
import { isObject, isUndefined, safeJsonParse } from "@/utils";

/**
 * Resolve a configuration value that may name an environment variable.
 *
 * A value that looks like a variable name is read from that variable; anything
 * else falls back to the default name for its key. A variable that is set wins
 * over the value written in the config.
 *
 * @param valueOrName the value written in the config
 * @param defaultName the variable to read when the value is not a name
 * @returns the value the variable holds, or the configured value
 */
export function resolveConfigValue(valueOrName: unknown, defaultName: string): unknown {
  const environmentName =
    typeof valueOrName === "string" && CONFIG_ENV_NAME_REGEX.test(valueOrName)
      ? valueOrName
      : defaultName.toUpperCase().replaceAll("-", "_");

  return getEnvironmentValue(environmentName) ?? valueOrName;
}

/**
 * Read an environment variable and parse booleans, JSON objects and JSON arrays.
 *
 * @param name the name of the environment variable
 * @returns the parsed value, the raw string, or undefined when the variable is not set
 */
export function getEnvironmentValue(name: string): unknown {
  const value = process.env[name];

  if (isUndefined(value)) return value;

  if (value === "true" || value === "false") {
    return value === "true";
  }

  const v = safeJsonParse(value);

  // Only return the parsed value if it is an object.
  if (isObject(v)) {
    return v;
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
 * The config schema rejects a value this cannot convert, so a store config is
 * only ever converted once it is known to be a duration.
 *
 * @param ttl the duration as a number of milliseconds or a string like `"1m"`
 * @returns the duration in milliseconds, or undefined when the value is not one
 */
export function getTTLValue(ttl?: number | string): number | undefined {
  if (isUndefined(ttl)) return undefined;

  try {
    const value = typeof ttl === "string" ? ms(ttl as StringValue) : ttl;

    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    // `ms` throws rather than returning undefined for some inputs.
    return undefined;
  }
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

/**
 * Resolve the `ttl` of a store config, leaving the key out when it is not set.
 *
 * The stores default an absent `ttl`; the key is therefore only added when a
 * usable duration is written.
 *
 * @param config the store config as written
 * @returns the config with `ttl` in milliseconds, or without the key
 */
export function withTTL<T extends { ttl?: number | string }>(config: T): Omit<T, "ttl"> & { ttl?: number } {
  const { ttl, ...rest } = config;
  const resolved = getTTLValue(ttl);

  return isUndefined(resolved) ? rest : { ...rest, ttl: resolved };
}
