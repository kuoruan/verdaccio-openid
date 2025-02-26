import { plugin } from "@/constants";
import process from "node:process";

import logger from "./logger";
import { getRegistryUrl } from "./npm";

const PUBLIC_REGISTRIES = ["registry.npmjs.org", "registry.npmmirror.com"];

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
    `npx ${plugin.name} --registry <URL>`,
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

  if (PUBLIC_REGISTRIES.some((item) => registry.includes(item))) {
    printUsage();
    process.exit(1);
  }

  return registry;
}
