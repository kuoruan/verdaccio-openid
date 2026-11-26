import { execFileSync } from "node:child_process";
import { URL } from "node:url";

import colors from "picocolors";

import logger from "./logger";
import { isNonEmptyString, isUndefined, safeJsonParse, stripTrailingSlashes } from "@/utils";

/** Registries the CLI refuses to authenticate against. */
const PUBLIC_REGISTRIES = [
  "registry.npmjs.org",
  "registry.npmmirror.com",
  "registry.npm.taobao.org",
  "registry.yarnpkg.com",
  "npm.pkg.github.com",
];

/**
 * Check whether the registry is a known public registry or mirror.
 *
 * @param registry the registry URL as a URL object
 * @returns `true` if the registry is a known public registry or mirror, `false` otherwise
 **/
export function isPublicRegistry(registry: URL): boolean {
  return PUBLIC_REGISTRIES.includes(registry.hostname.replace(/\.$/, ""));
}

let npmConfig: Record<string, unknown> | undefined;

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
  npmConfig = safeJsonParse<Record<string, unknown> | null>(npmConfigJson) ?? {};

  return npmConfig;
}

/**
 * Return the registry configured in npm, falling back to the public registry.
 *
 * @returns the registry URL without a trailing slash
 */
export function getNpmRegistry(): string {
  const registry = getNpmConfig().registry;
  if (!isNonEmptyString(registry)) {
    return `https://${PUBLIC_REGISTRIES[0]}`;
  }

  return stripTrailingSlashes(registry.trim());
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
export function saveNpmToken(token: string, registry: string) {
  const url = new URL(registry);

  let baseUrl = `${url.host}${url.pathname}`;
  if (!baseUrl.endsWith("/")) {
    baseUrl += "/";
  }

  const key = `//${baseUrl}:_authToken`;

  runCommand("npm", ["config", "set", key, token], `npm config set ${key} "<token>"`);
}
