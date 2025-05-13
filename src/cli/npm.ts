import { execSync } from "node:child_process";
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

function runCommand(command: string, logCommand: boolean | string = true): string {
  if (logCommand) {
    logger.info("Running command:", colors.blackBright(typeof logCommand === "string" ? logCommand : command));
  }

  return execSync(command).toString();
}

function getNpmConfig(): Record<string, unknown> {
  if (!npmConfig) {
    const npmConfigJson = runCommand("npm config list --json", false);

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

export function getNpmSaveCommand(registry: string, token: string): string {
  const url = new URL(registry);

  let baseUrl = `${url.host}${url.pathname}`;
  if (!baseUrl.endsWith("/")) {
    baseUrl = `${baseUrl}/`;
  }

  return `npm config set //${baseUrl}:_authToken "${token}"`;
}

export function saveNpmToken(token: string) {
  const registry = getRegistryUrl();
  const command = getNpmSaveCommand(registry, token);

  runCommand(command, command.replace(/".*"/, '"<token>"'));
}
