import { readFileSync } from "node:fs";

import { clientEntryName, clientManifestPath } from "@/server/constants";
import { isObject } from "@/utils";

/** File names the client build emits. */
const HASHED_SCRIPT = /^verdaccio-openid\.[A-Za-z0-9_-]+\.js$/;

/**
 * Read the manifest once at plugin start and return the entry script.
 *
 * @param manifestPath the manifest file to read; defaults to the built manifest
 * @returns the file name to append to the static path
 */
export function loadClientEntry(manifestPath: string = clientManifestPath): string {
  let manifest: unknown;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    throw new Error(`Cannot read the client manifest at ${manifestPath}: ${(e as Error).message}`);
  }

  const script = isObject(manifest) ? manifest[clientEntryName] : undefined;

  if (typeof script !== "string" || !HASHED_SCRIPT.test(script)) {
    throw new Error(`The client manifest at ${manifestPath} does not name a hashed file for "${clientEntryName}"`);
  }

  return script;
}
