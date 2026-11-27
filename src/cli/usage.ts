import process from "node:process";

import { plugin } from "@/constants";
import { isNonEmptyString, isUndefined, stripTrailingSlashes } from "@/utils";

import logger from "./logger";
import { cliErrorMessage } from "./response";
import { getNpmRegistry, isPublicRegistry } from "./npm";

const usageLines = [
  "========================= Usage =========================",
  "Point npm at your Verdaccio URL first:",
  "",
  "npm config set registry <URL>",
  "",
  "Or pass the registry to the CLI:",
  "",
  `npx ${plugin.name} --registry <URL>`,
  "",
  "--no-proxy     Connect without using environment proxies.",
  "--unsafe-urls  Skip security checks on login and token URLs (unsafe).",
  "========================================================",
];

function printUsage() {
  for (const line of usageLines) {
    logger.info(line);
  }
}

/**
 * Return the registry to authenticate against.
 *
 * Exits with the usage text when `--registry` is not a non-empty string, when
 * the npm config cannot be read, or when the registry is a public one.
 *
 * @returns the configured registry URL without a trailing slash
 */
export function validateRegistry(cliRegistry?: unknown): string {
  let registry: string;
  let isPublic: boolean;

  try {
    if (!isUndefined(cliRegistry) && !isNonEmptyString(cliRegistry)) {
      throw new Error("The --registry option expects a URL.");
    }
    registry = isUndefined(cliRegistry) ? getNpmRegistry() : stripTrailingSlashes(cliRegistry.trim());

    let url: URL;
    try {
      url = new URL(registry);
    } catch {
      throw new Error("The registry URL is not valid.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("The registry must use HTTP or HTTPS.");
    }
    isPublic = isPublicRegistry(url);
  } catch (error) {
    logger.error(cliErrorMessage(error));
    printUsage();
    process.exit(1);
  }

  if (isPublic) {
    logger.error("Refusing to log in to a public npm registry or mirror.");
    printUsage();
    process.exit(1);
  }

  return registry;
}
