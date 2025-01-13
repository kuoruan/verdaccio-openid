import type { Application, Handler, Request } from "express";

import { plugin } from "@/constants";
import type { ConfigHolder } from "@/server/config/Config";
import { staticPath } from "@/server/constants";
import logger from "@/server/logger";

import type { PluginMiddleware } from "./Plugin";
import { getBaseUrl } from "./utils";

/**
 * Injects additional static imports into the DOM with code from the client folder
 * that modifies the login button.
 */
export class PatchHtml implements PluginMiddleware {
  constructor(private readonly config: ConfigHolder) {}

  register_middlewares(app: Application) {
    app.use(this.patchResponse);
  }

  /**
   * Patches `res.send` in order to inject style and script tags.
   */
  patchResponse: Handler = (req, res, next) => {
    const originalSend = res.send;

    res.send = (html) => {
      try {
        const patchedHtml = this.insertTags(html, req);

        return originalSend.call(res, patchedHtml);
      } catch (err: any) {
        logger.error({ message: err.message }, "Failed to patch HTML: @{message}");

        return originalSend.call(res, html);
      }
    };
    next();
  };

  private insertTags(html: string | Buffer, req: Request): string {
    const htmlString = Buffer.isBuffer(html) ? html.toString() : html;

    if (!htmlString.includes("__VERDACCIO_BASENAME_UI_OPTIONS")) {
      return htmlString;
    }

    const scriptTag = this.generateScriptTag(req);

    return htmlString.replace(/<\/body>/, `${scriptTag}</body>`);
  }

  private generateScriptTag(req: Request): string {
    const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);
    const scriptName = `${plugin.name}-${plugin.version}.js`;

    const scriptSrc = `${baseUrl}${staticPath}/${scriptName}`;

    return `<script defer="defer" src="${scriptSrc}"></script>`;
  }
}
