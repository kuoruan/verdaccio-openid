import { cliName } from "@/constants";

import logger from "./logger";
import { getRegistryUrl } from "./npm";

export function getUsageInfo() {
  return [
    "========================= Usage =========================",
    "It seems you are using the default npm registry.",
    "Please update it to your Verdaccio URL by either running:",
    "",
    "npm config set registry <URL>",
    "",
    "Or by using the registry argument:",
    "",
    `npx ${cliName} --registry <URL>`,
    "========================================================",
  ];
}

export function printUsage() {
  for (const line of getUsageInfo()) {
    logger.info(line);
  }
}

export function validateRegistry() {
  const registry = getRegistryUrl();

  if (registry.includes("registry.npmjs.org")) {
    printUsage();
    process.exit(1);
  }

  return registry;
}
