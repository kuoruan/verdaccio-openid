import type { Response } from "express";

import { buildAccessDeniedPage, buildErrorPage, buildStatusPage } from "../status-page";
import { getNpmConfigFile } from "./npm";

const withBack = false;

const successPage = buildStatusPage(
  `<h1>All done!</h1>
  <p>We've updated your npm configuration.</p>
  <p><code>${getNpmConfigFile()}</code></p>`,
  withBack
);

export function respondWithWebPage(status: string, message: string, res: Response) {
  res.setHeader("Content-Type", "text/html");

  switch (status) {
    case "success":
      res.status(200);
      res.send(successPage);
      break;

    case "denied":
      res.status(401);
      res.send(buildAccessDeniedPage(withBack));
      break;

    default:
      res.status(500);
      res.send(buildErrorPage(message, withBack));
      break;
  }
}
