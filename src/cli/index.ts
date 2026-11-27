#!/usr/bin/env node

import process from "node:process";
import { parseArgs } from "node:util";

import logger, { logPluginInfo } from "./logger";
import { saveNpmToken } from "./npm";
import { respondWithCliSuccess, cliErrorMessage } from "./response";
import { validateRegistry } from "./usage";
import { webLogin } from "./web-login";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    registry: { type: "string" },
    "no-proxy": { type: "boolean" },
    "unsafe-urls": { type: "boolean" },
  },
  // Unknown arguments stay ignored, as they were before.
  strict: false,
});
const registry = validateRegistry(values.registry);

logPluginInfo();

/**
 * Log in and save the token. Every failure ends here with a non-zero exit;
 * the CLI never falls back to a local callback.
 */
async function main(): Promise<void> {
  try {
    const token = await webLogin(registry, {
      useProxy: values["no-proxy"] !== true,
      validateUrls: values["unsafe-urls"] !== true,
    });

    saveNpmToken(token, registry);
  } catch (error: any) {
    logger.error(cliErrorMessage(error));
    process.exit(1);
  }

  respondWithCliSuccess();
}

void main();
