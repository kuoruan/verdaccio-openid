import type { Response } from "express";
import colors from "picocolors";

import { messageGroupRequired } from "@/constants";
import { buildAccessDeniedPage, buildErrorPage, buildStatusPage } from "@/status-page";

import logger from "./logger";
import { getNpmConfigFile } from "./npm";

const messageSuccess = "All done! We've updated your npm configuration.";

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
      logger.warn(message);
      break;
    }
  }
}

export function respondWithWebPage(status: string, message: string, res: Response) {
  res.setHeader("Content-Type", "text/html");

  switch (status) {
    case "success": {
      res.status(200);
      res.send(
        buildStatusPage(
          `<h1>All done!</h1>
          <p>${messageSuccess}</p>
          <p><code>${getNpmConfigFile()}</code></p>`,
        ),
      );
      break;
    }

    case "denied": {
      res.status(401);
      res.send(buildAccessDeniedPage());
      break;
    }

    default: {
      res.status(500);
      res.send(buildErrorPage(message));
      break;
    }
  }
}
