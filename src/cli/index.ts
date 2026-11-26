#!/usr/bin/env node

import process from "node:process";
import minimist from "minimist";

import logger, { logPluginInfo } from "./logger";
import { saveNpmToken } from "./npm";
import { respondWithCliSuccess, cliErrorMessage } from "./response";
import { validateRegistry } from "./usage";
import { webLogin } from "./web-login";

type Args = {
  registry?: string;
  proxy?: boolean;
  "unsafe-urls"?: boolean;
};

const args = minimist<Args>(process.argv.slice(2), {
  string: ["registry"],
  boolean: ["proxy", "unsafe-urls"],
  default: { proxy: true },
});
const registry = validateRegistry(args.registry);

logPluginInfo();

/**
 * Log in and save the token. Every failure ends here with a non-zero exit;
 * the CLI never falls back to a local callback.
 */
async function main(): Promise<void> {
  try {
    const token = await webLogin(registry, {
      useProxy: args.proxy !== false,
      validateUrls: args["unsafe-urls"] !== true,
    });

    saveNpmToken(token, registry);
  } catch (error: any) {
    logger.error(cliErrorMessage(error));
    process.exit(1);
  }

  respondWithCliSuccess();
}

void main();
