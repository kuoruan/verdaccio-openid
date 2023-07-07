import { IPluginMiddleware } from "@verdaccio/types";
import { static as expressServeStatic } from "express";

import { publicRoot, staticPath } from "@/constants";

import type { Application } from "express";

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
