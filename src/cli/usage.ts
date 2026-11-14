import process from "node:process";

import { plugin } from "@/constants";

import logger from "./logger";
import { getRegistryUrl, PUBLIC_REGISTRIES } from "./npm";

/** Lines explaining that the CLI needs a Verdaccio registry rather than the public one. */
export function getUsageInfo() {
  return [
    "========================= Usage =========================",
    "You are using a public npm registry or mirror.",
    "Point npm at your Verdaccio URL first:",
    "",
    "npm config set registry <URL>",
    "",
    "Or pass the registry to the CLI:",
    "",
    `npx ${plugin.name} --registry <URL>`,
    "========================================================",
  ];
}

/** Print the usage lines through the CLI logger. */
export function printUsage() {
  for (const line of getUsageInfo()) {
    logger.info(line);
  }
}

/**
 * Return the registry to authenticate against, exiting when it is a public one.
 *
 * @returns the configured registry URL
 */
export function validateRegistry() {
  const registry = getRegistryUrl();

  if (PUBLIC_REGISTRIES.some((item) => registry.includes(item))) {
    printUsage();
    process.exit(1);
  }

  return registry;
}
