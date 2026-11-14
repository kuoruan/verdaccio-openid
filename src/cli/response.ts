import type { Response } from "express";
import colors from "picocolors";

import { messageGroupRequired, messageLoggedAndCloseWindow } from "@/constants";
import { buildAccessDeniedPage, buildErrorPage, buildSuccessPage } from "@/status-page";

import logger from "./logger";
import { getNpmConfigFile } from "./npm";

const messageSuccess = "All done. We've updated your npm configuration.";

/**
 * Report the outcome of the CLI login on the terminal.
 *
 * @param status `success`, `denied`, or anything else, which is reported as an error
 * @param message the message the server sent for a non-success status
 */
export function respondWithCliMessage(status: string, message: string) {
  switch (status) {
    case "success": {
      logger.success(messageSuccess);
      logger.info("Path:", colors.blackBright(getNpmConfigFile()));
      break;
    }

    case "denied": {
      logger.error(messageGroupRequired);
      break;
    }

    default: {
      logger.error(message);
      break;
    }
  }
}

/**
 * Report the outcome of the CLI login in the browser tab the CLI opened.
 *
 * @param status `success`, `denied`, or anything else, which is reported as an error page
 * @param message the message the server sent for a non-success status
 * @param res the response of the local callback server
 */
export function respondWithWebPage(status: string, message: string, res: Response) {
  res.setHeader("Content-Type", "text/html");

  switch (status) {
    case "success": {
      res.status(200).send(
        buildSuccessPage(
          `${messageSuccess}<br>
          <code>${getNpmConfigFile()}</code><br>
          ${messageLoggedAndCloseWindow}`,
        ),
      );
      break;
    }

    case "denied": {
      res.status(401).send(buildAccessDeniedPage());
      break;
    }

    default: {
      res.status(500).send(buildErrorPage(message));
      break;
    }
  }
}
