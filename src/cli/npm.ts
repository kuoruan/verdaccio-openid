import { execSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

import minimist from "minimist";
import colors from "picocolors";

import logger from "./logger";

let npmConfig: Record<string, unknown>;

function parseCliArgs() {
  return minimist(process.argv.slice(2));
}

function runCommand(command: string): string {
  logger.info("Running command:", colors.blackBright(command));

  return execSync(command).toString();
}

function getNpmConfig(): Record<string, unknown> {
  if (!npmConfig) {
    const npmConfigJson = runCommand("npm config list --json");

    npmConfig = JSON.parse(npmConfigJson);
  }
  return npmConfig;
}

function removeTrailingSlash(input: string): string {
  return input.trim().replace(/\/?$/, "");
}

export function getRegistryUrl(): string {
  const cliArgs = parseCliArgs();

  const registry = cliArgs.registry || getNpmConfig().registry;

  return removeTrailingSlash(registry as string);
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

  runCommand(command);
}
