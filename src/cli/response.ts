import { stripVTControlCharacters } from "node:util";

import colors from "picocolors";

import { messageNpmConfigUpdated } from "@/constants";

import logger from "./logger";
import { getNpmConfigFile } from "./npm";

/**
 * Report a login that finished.
 *
 * Only a successful login reaches this: a failure exits before it runs.
 */
export function respondWithCliSuccess() {
  logger.success(messageNpmConfigUpdated);
  logger.info("Path:", colors.blackBright(getNpmConfigFile()));
}

/**
 * Turn a failure into terminal text.
 *
 * The message can come from a remote server, so control sequences are stripped
 * and line breaks are flattened before it reaches the terminal: a bare `\r`
 * would otherwise let the message overwrite what was printed before it.
 *
 * @param error the thrown value
 * @returns the message to print
 */
export function cliErrorMessage(error: unknown): string {
  const message = (error as any)?.message ?? error;

  return stripVTControlCharacters(String(message)).replace(/[\r\n]+/g, " ");
}
