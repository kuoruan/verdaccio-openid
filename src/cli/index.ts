#!/usr/bin/env node

import process from "node:process";

import logger, { logPluginInfo } from "./logger";
import { saveNpmToken } from "./npm";
import { respondWithCliSuccess, cliErrorMessage } from "./response";
import { validateRegistry } from "./usage";
import { webLogin } from "./web-login";

const registry = validateRegistry();

logPluginInfo();

/**
 * Log in and save the token. Every failure ends here with a non-zero exit;
 * the CLI never falls back to a local callback.
 */
async function main(): Promise<void> {
  try {
    const token = await webLogin(registry);

    saveNpmToken(token);
  } catch (error: any) {
    logger.error(cliErrorMessage(error));
    process.exit(1);
  }

  respondWithCliSuccess();
}

void main();
