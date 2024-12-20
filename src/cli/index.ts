#!/usr/bin/env node

import express from "express";
import open from "open";

import { cliPort, cliProviderId } from "@/constants";
import { getAuthorizePath } from "@/redirect";

import logger from "./logger";
import { saveNpmToken } from "./npm";
import { respondWithCliMessage, respondWithWebPage } from "./response";
import { validateRegistry } from "./usage";

const registry = validateRegistry();
const authorizeUrl = registry + getAuthorizePath(cliProviderId);

const server = express()
  .get("/", (req, res) => {
    let status = String(req.query.status);
    let message = String(req.query.message);
    const token = String(req.query.token);

    if (status === "success") {
      try {
        saveNpmToken(token);
      } catch (error: any) {
        status = "error";
        message = error.message;
      }
    }

    respondWithWebPage(status, message, res);
    respondWithCliMessage(status, message);

    server.close();

    process.exit(status === "success" ? 0 : 1);
  })
  .listen(cliPort, () => {
    logger.info(`Listening on port ${cliPort}...`);
    logger.info(`Opening ${authorizeUrl} in your browser...`);

    open(authorizeUrl).catch(() => {
      logger.error("Failed to open browser window.");
      logger.warn("Please visit the following URL manually:");
      logger.info(authorizeUrl);
    });
  });
