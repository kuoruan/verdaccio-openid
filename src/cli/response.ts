import type { Response } from "express";

import { messageGroupRequired } from "@/constants";
import { buildAccessDeniedPage, buildErrorPage, buildStatusPage } from "@/status-page";
import colors from "picocolors";

import logger from "./logger";
import { getNpmConfigFile } from "./npm";

const messageSuccess = "All done! We've updated your npm configuration.";

export function respondWithCliMessage(status: string, message: string) {
  switch (status) {
    case "denied": {
      logger.error(messageGroupRequired);
      break;
    }

    case "success": {
      logger.success(messageSuccess);
      logger.info("Path:", colors.blackBright(getNpmConfigFile()));
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
    case "denied": {
      res.status(401);
      res.send(buildAccessDeniedPage());
      break;
    }

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

    default: {
      res.status(500);
      res.send(buildErrorPage(message));
      break;
    }
  }
}
