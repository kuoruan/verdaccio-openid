#!/usr/bin/env node

import express from "express";
import open from "open";

import { cliPort, cliProviderId } from "@/constants";
import { getAuthorizePath } from "@/redirect";

import { respondWithCliMessage } from "./cli-response";
import { saveNpmToken } from "./npm";
import { validateRegistry } from "./usage";
import { respondWithWebPage } from "./web-response";

const registry = validateRegistry();
const authorizeUrl = registry + getAuthorizePath(cliProviderId);

const server = express()
  .get("/", (req, res) => {
    let status = String(req.query.status);
    let message = String(req.query.message);
    const token = String(req.query.token);

    try {
      if (status === "success") {
        saveNpmToken(token);
      }
    } catch (error: any) {
      status = "error";
      message = error.message;
    }

    respondWithWebPage(status, message, res);
    respondWithCliMessage(status, message);

    server.close();

    process.exit(status === "success" ? 0 : 1);
  })
  .listen(cliPort, () => {
    console.log(`Listening on port ${cliPort}...`);

    console.log(`Opening ${authorizeUrl} in your browser...`);

    void open(authorizeUrl);
  });
