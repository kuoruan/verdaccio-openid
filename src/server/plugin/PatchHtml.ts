import type { Application, Handler, Request } from "express";

import { plugin } from "@/constants";
import type { ConfigHolder } from "@/server/config/Config";
import {
  staticPath,
  VERDACCIO_BASENAME_UI_OPTIONS_MARKER,
  VERDACCIO_UI_OPTIONS_SCRIPT_MARKER,
} from "@/server/constants";
import logger from "@/server/logger";

import type { PluginMiddleware } from "./Plugin";
import { getBaseUrl } from "./utils";

/**
 * Adds the client bundle and its options to the HTML Verdaccio serves, so the
 * UI gets the OpenID login button and the usage info.
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
   * Replace `res.send` so every rendered page gets the injected tags.
   *
   * A failure while patching falls back to the original HTML, so a markup
   * change in Verdaccio cannot break the UI.
   */
  patchResponse: Handler = (req, res, next) => {
    const originalSend = res.send;

    res.send = (html, ...args) => {
      try {
        const patchedHtml = this.insertTags(html, req);

        return originalSend.call(res, patchedHtml, ...args);
      } catch (err: any) {
        logger.error({ message: err.message }, "Failed to patch HTML: @{message}");

        return originalSend.call(res, html, ...args);
      }
    };
    next();
  };

  private insertTags(html: any, req: Request): any {
    const htmlString = Buffer.isBuffer(html) ? html.toString() : html;

    const shouldPatchHtml =
      typeof htmlString === "string" &&
      [VERDACCIO_BASENAME_UI_OPTIONS_MARKER, VERDACCIO_UI_OPTIONS_SCRIPT_MARKER].some((marker) =>
        htmlString.includes(marker),
      );

    if (!shouldPatchHtml) {
      return html;
    }

    const bodyLineRegex = /^(\s*)<\/body>/m;

    const indent = bodyLineRegex.exec(htmlString)?.[1] ?? "";

    const scriptTag = this.generateScriptTag(req, indent);

    return htmlString.replace(bodyLineRegex, () => `${scriptTag}</body>`);
  }

  private generateScriptTag(req: Request, indent: string): string {
    const baseUrl = getBaseUrl(this.urlPrefix, req, true);
    const scriptName = `${plugin.name}-${plugin.version}.js`;

    const scriptSrc = `${baseUrl}${staticPath}/${scriptName}`;

    // JSON.stringify escapes quotes; replacing "<" keeps a configured
    // "</script>" value from terminating the inline script block.
    const options = JSON.stringify({
      keepPasswdLogin: this.keepPasswdLogin,
      loginButtonText: this.loginButtonText,
    }).replaceAll("<", String.raw`\u003C`);

    return [
      `<script>`,
      `    window.__VERDACCIO_OPENID_OPTIONS=${options}`,
      `</script>`,
      `<script defer="defer" src="${scriptSrc}"></script>`,
      "",
    ]
      .map((line) => `${indent}${line}`)
      .join("");
  }
}
