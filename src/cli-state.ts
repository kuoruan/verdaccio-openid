import { randomBytes } from "node:crypto";

/** Separator between the random state and the CLI callback port. */
const cliStatePortSeparator = "~";

/**
 * Build a CLI auth state that carries the callback `port` through the OIDC round-trip.
 *
 * @param port the CLI's actual listening port
 * @returns `<random>~<port>`
 */
export function buildCliState(port: string): string {
  return `${randomBytes(16).toString("base64url")}${cliStatePortSeparator}${port}`;
}

/**
 * Extract the CLI callback port from an auth state.
 *
 * @param state the OIDC state returned by the provider
 * @returns the port, or `undefined` when the state carries none
 */
export function parseCliPort(state: string | undefined): string | undefined {
  if (!state) {
    return undefined;
  }
  const idx = state.lastIndexOf(cliStatePortSeparator);
  if (idx === -1) {
    return undefined;
  }
  const port = state.slice(idx + 1);
  return /^\d+$/.test(port) ? port : undefined;
}
