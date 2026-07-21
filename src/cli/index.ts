#!/usr/bin/env node

import process from "node:process";

import express from "express";
import open from "open";

import { cliFallbackPort, cliPort, cliProviderId } from "@/constants";
import { getAuthorizePath } from "@/paths";

import logger, { logPluginInfo } from "./logger";
import { saveNpmToken } from "./npm";
import { respondWithCliMessage, respondWithWebPage } from "./response";
import { validateRegistry } from "./usage";

const registry = validateRegistry();

logPluginInfo();

/**
 * Start the callback server on `port`.
 *
 * Resolves once listening (the browser is then opened); rejects with the server
 * `error` event (e.g. `EADDRINUSE`) so the caller can try the next port.
 *
 * @param port the port to listen on
 */
function startServer(port: number): Promise<void> {
  // The CLI's actual listening port must reach the server's callback handler,
  // so it is appended here and threaded back through the OIDC state server-side.
  const authorizeUrl = `${registry}${getAuthorizePath(cliProviderId)}?port=${port}`;

  return new Promise<void>((resolve, reject) => {
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
      .listen(port, async () => {
        logger.info(`Listening on port ${port}...`);
        logger.info(`Opening ${authorizeUrl} in your browser...`);

        try {
          await open(authorizeUrl);
        } catch {
          logger.error("Failed to open browser window.");
          logger.warn("Please visit the following URL manually:");
          logger.info(authorizeUrl);
        }

        resolve();
      });

    server.on("error", reject);
  });
}

/**
 * Try each candidate port in turn; keep the first one that listens.
 */
async function main(): Promise<void> {
  for (const port of [cliPort, cliFallbackPort]) {
    try {
      await startServer(port);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        logger.error((err as Error).message);
        process.exit(1);
      }

      logger.warn(`Port ${port} is in use, trying the next fallback...`);
    }
  }

  logger.error(`Both ports ${cliPort} and ${cliFallbackPort} are in use, aborting.`);
  process.exit(1);
}

void main();
