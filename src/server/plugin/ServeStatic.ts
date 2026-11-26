import type { Application } from "express";
import serveStatic from "serve-static";

import { publicRoot, staticPath } from "@/server/constants";

import type { PluginMiddleware } from "./Plugin";

/** Serve the hashed client bundle; set the cache header only on a file that was found. */
export class ServeStatic implements PluginMiddleware {
  constructor(private readonly root: string = publicRoot) {}

  register_middlewares(app: Application) {
    app.use(
      staticPath,
      serveStatic(this.root, {
        index: false,
        setHeaders(res, path) {
          if (path.endsWith(".js")) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
  }
}
