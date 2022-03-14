import { IPluginMiddleware } from "@verdaccio/types";
import { static as expressServeStatic } from "express";

import { staticPath } from "@/constants";

import type { Application } from "express";

/**
 * Serves additional static assets required to modify the login button.
 */
export class ServeStatic implements IPluginMiddleware<any> {
  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    const clientPath = new URL("../client", import.meta.url).pathname;
    app.use(staticPath, expressServeStatic(clientPath));
  }
}
