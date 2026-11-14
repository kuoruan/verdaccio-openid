import { execFileSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

import minimist from "minimist";
import colors from "picocolors";

import logger from "./logger";

/** Registries the CLI refuses to authenticate against. */
export const PUBLIC_REGISTRIES = ["registry.npmjs.org", "registry.npmmirror.com", "registry.npm.taobao.org"];

let npmConfig: Record<string, unknown> | undefined;

function parseCliArgs() {
  return minimist(process.argv.slice(2));
}

function runCommand(command: string, args: string[] = [], logCommand: boolean | string = true): string {
  if (logCommand) {
    const displayCommand = typeof logCommand === "string" ? logCommand : [command, ...args].join(" ");

    logger.info("Running command:", colors.blackBright(displayCommand));
  }

  return execFileSync(command, args, { encoding: "utf8" });
}

function getNpmConfig(): Record<string, unknown> {
  if (npmConfig) {
    return npmConfig;
  }

  const npmConfigJson = runCommand("npm", ["config", "list", "--json"], false);

  try {
    npmConfig = JSON.parse(npmConfigJson) as Record<string, unknown>;
  } catch {
    return {};
  }
  return npmConfig;
}

function removeTrailingSlash(input: string): string {
  return input.trim().replace(/\/?$/, "");
}

/**
 * Resolve the registry from `--registry`, then from the npm config, then the public one.
 *
 * @returns the registry URL without a trailing slash
 */
export function getRegistryUrl(): string {
  const cliArgs = parseCliArgs();

  const registry = cliArgs.registry ?? getNpmConfig().registry;

  if (!registry) {
    return PUBLIC_REGISTRIES[0];
  }

  return removeTrailingSlash(registry);
}

/** The npm config file the token is written to, as npm reports it. */
export function getNpmConfigFile(): string {
  return getNpmConfig().userconfig as string;
}

/**
 * Write the token into the npm config for the registry in use.
 *
 * @param token the npm token issued by the plugin
 */
export function saveNpmToken(token: string) {
  const registry = getRegistryUrl();
  const url = new URL(registry);

  let baseUrl = `${url.host}${url.pathname}`;
  if (!baseUrl.endsWith("/")) {
    baseUrl += "/";
  }

  const key = `//${baseUrl}:_authToken`;

  runCommand("npm", ["config", "set", key, token], `npm config set ${key} "<token>"`);
}
