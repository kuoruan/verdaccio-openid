import { execSync } from "node:child_process";
import { URL } from "node:url";

import minimist from "minimist";

import logger from "@/server/logger";

let npmConfig: Record<string, unknown>;

function parseCliArgs() {
  return minimist(process.argv.slice(2));
}

function runCommand(command: string) {
  logger.info({ command }, "running command: @{command}");
  return execSync(command);
}

function getNpmConfig(): Record<string, unknown> {
  if (!npmConfig) {
    npmConfig = JSON.parse(runCommand("npm config list --json").toString());
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

export function getNpmSaveCommands(registry: string, token: string): string[] {
  const url = new URL(registry);

  let baseUrl = `${url.host}${url.pathname}`;
  if (!baseUrl.endsWith("/")) {
    baseUrl = `${baseUrl}/`;
  }

  return [`npm config set //${baseUrl}:_authToken "${token}"`];
}

export function saveNpmToken(token: string) {
  const registry = getRegistryUrl();
  const commands = getNpmSaveCommands(registry, token);

  for (const command of commands) {
    runCommand(command);
  }
}
