import { execFileSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

import minimist from "minimist";
import colors from "picocolors";

import logger from "./logger";
import { isNonEmptyString, isUndefined, safeJsonParse } from "@/utils";

/** Registries the CLI refuses to authenticate against. */
export const PUBLIC_REGISTRIES = ["registry.npmjs.org", "registry.npmmirror.com", "registry.npm.taobao.org"];

let npmConfig: Record<string, unknown> | undefined;

function parseCliArgs() {
  return minimist(process.argv.slice(2));
}

/**
 * Run a command and return its stdout.
 *
 * On failure the error is replaced: Node's message embeds the full argv, which
 * for `npm config set` is the token itself, and stderr can carry anything.
 *
 * @param command the executable
 * @param args the arguments
 * @param logCommand what to print as the command; `false` prints nothing
 * @returns the command's stdout
 */
function runCommand(command: string, args: string[] = [], logCommand: boolean | string = true): string {
  const displayCommand = typeof logCommand === "string" ? logCommand : [command, ...args].join(" ");

  if (logCommand) {
    logger.info("Running command:", colors.blackBright(displayCommand));
  }

  try {
    return execFileSync(command, args, { encoding: "utf8" });
  } catch {
    throw new Error(`command failed: ${displayCommand}`);
  }
}

function getNpmConfig(): Record<string, unknown> {
  if (!isUndefined(npmConfig)) {
    return npmConfig;
  }

  const npmConfigJson = runCommand("npm", ["config", "list", "--json"], false);

  // Cache the empty result too, so a broken config is not re-read on every call.
  npmConfig = (safeJsonParse(npmConfigJson) as Record<string, unknown> | null | undefined) ?? {};

  return npmConfig;
}

function removeTrailingSlash(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

/**
 * Resolve the registry from `--registry`, then from the npm config, then the public one.
 *
 * @returns the registry URL without a trailing slash
 */
export function getRegistryUrl(): string {
  const cliArgs = parseCliArgs();
  const cliRegistry = cliArgs.registry;

  if (!isUndefined(cliRegistry) && !isNonEmptyString(cliRegistry)) {
    throw new Error("--registry expects a URL");
  }

  const configured = cliRegistry ?? getNpmConfig().registry;
  const registry = typeof configured === "string" ? configured : "";

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
