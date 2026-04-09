import { execFileSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

import minimist from "minimist";
import colors from "picocolors";

import logger from "./logger";

export const PUBLIC_REGISTRIES = ["registry.npmjs.org", "registry.npmmirror.com", "registry.npm.taobao.org"];

let npmConfig: Record<string, unknown>;

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
  if (!npmConfig) {
    const npmConfigJson = runCommand("npm", ["config", "list", "--json"], false);

    npmConfig = JSON.parse(npmConfigJson);
  }
  return npmConfig;
}

function removeTrailingSlash(input: string): string {
  return input.trim().replace(/\/?$/, "");
}

export function getRegistryUrl(): string {
  const cliArgs = parseCliArgs();

  const registry = cliArgs.registry ?? getNpmConfig().registry;

  if (!registry) {
    return PUBLIC_REGISTRIES[0];
  }

  return removeTrailingSlash(registry);
}

export function getNpmConfigFile(): string {
  return getNpmConfig().userconfig as string;
}

export function saveNpmToken(token: string) {
  const registry = getRegistryUrl();
  const url = new URL(registry);

  let baseUrl = `${url.host}${url.pathname}`;
  if (!baseUrl.endsWith("/")) {
    baseUrl = `${baseUrl}/`;
  }

  const key = `//${baseUrl}:_authToken`;

  runCommand("npm", ["config", "set", key, token], `npm config set ${key} "<token>"`);
}
