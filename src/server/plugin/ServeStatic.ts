import type { IPluginMiddleware } from "@verdaccio/types";
import { type Application, static as expressServeStatic } from "express";

import { publicRoot, staticPath } from "@/server/constants";

/**
 * Serves additional static assets required to modify the login button.
 */
export class ServeStatic implements IPluginMiddleware<any> {
  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    app.use(staticPath, expressServeStatic(publicRoot));
  }
}
