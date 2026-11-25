import process from "node:process";

import { plugin } from "@/constants";

import logger from "./logger";
import { cliErrorMessage } from "./response";
import { getRegistryUrl, PUBLIC_REGISTRIES } from "./npm";

const usageLines = [
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

function printUsage() {
  for (const line of usageLines) {
    logger.info(line);
  }
}

/**
 * Return the registry to authenticate against, exiting when it is a public one.
 *
 * @returns the configured registry URL
 */
export function validateRegistry(): string {
  let registry: string;

  try {
    registry = getRegistryUrl();
  } catch (error) {
    logger.error(cliErrorMessage(error));
    printUsage();
    process.exit(1);
  }

  if (PUBLIC_REGISTRIES.some((item) => registry.includes(item))) {
    printUsage();
    process.exit(1);
  }

  return registry;
}
