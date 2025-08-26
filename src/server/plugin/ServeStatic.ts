import type { Application } from "express";
import serveStatic from "serve-static";

import { publicRoot, staticPath } from "@/server/constants";

import type { PluginMiddleware } from "./Plugin";

/**
 * Serves additional static assets required to modify the login button.
 */
export class ServeStatic implements PluginMiddleware {
  register_middlewares(app: Application) {
    app.use(staticPath, serveStatic(publicRoot));
  }
}
