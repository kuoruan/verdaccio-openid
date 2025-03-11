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
  private urlPrefix: string;
  private keepPasswdLogin: boolean;
  private loginButtonText: string;

  constructor(config: ConfigHolder) {
    this.urlPrefix = config.urlPrefix;
    this.keepPasswdLogin = config.keepPasswdLogin;
    this.loginButtonText = config.loginButtonText;
  }

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

  private insertTags(html: any, req: Request): any {
    const htmlString = Buffer.isBuffer(html) ? html.toString() : html;

    if (typeof htmlString !== "string" || !htmlString.includes("__VERDACCIO_BASENAME_UI_OPTIONS")) {
      return html;
    }

    const bodyLineRegex = /^(\s*)<\/body>/m;

    const indent = bodyLineRegex.exec(htmlString)?.[1] ?? "";

    const scriptTag = this.generateScriptTag(req, indent);

    return htmlString.replace(bodyLineRegex, `${scriptTag}</body>`);
  }

  private generateScriptTag(req: Request, indent: string): string {
    const baseUrl = getBaseUrl(this.urlPrefix, req, true);
    const scriptName = `${plugin.name}-${plugin.version}.js`;

    const scriptSrc = `${baseUrl}${staticPath}/${scriptName}`;

    return [
      `<script>`,
      `    window.__VERDACCIO_OPENID_OPTIONS={"keepPasswdLogin":${this.keepPasswdLogin},"loginButtonText":"${this.loginButtonText}"}`,
      `</script>`,
      `<script defer="defer" src="${scriptSrc}"></script>`,
      "",
    ]
      .map((line) => `${indent}${line}`)
      .join("");
  }
}
