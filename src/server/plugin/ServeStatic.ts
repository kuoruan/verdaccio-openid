import { publicRoot, staticPath } from "@/server/constants";
import { type Application, static as expressServeStatic } from "express";

import type { PluginMiddleware } from "./Plugin";

/**
 * Serves additional static assets required to modify the login button.
 */
export class ServeStatic implements PluginMiddleware {
  register_middlewares(app: Application) {
    app.use(staticPath, expressServeStatic(publicRoot));
  }
}
