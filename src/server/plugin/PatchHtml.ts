import type { Application, Handler, Request } from "express";

import type { ConfigHolder } from "@/server/config/Config";
import {
  staticPath,
  VERDACCIO_BASENAME_UI_OPTIONS_MARKER,
  VERDACCIO_UI_OPTIONS_SCRIPT_MARKER,
} from "@/server/constants";
import logger from "@/server/logger";

import type { PluginMiddleware } from "./Plugin";
import { getBaseUrl } from "./utils";
import { isUndefined } from "@/utils";

/** Matches the closing body tag and captures its indentation. */
const BODY_LINE = /^(\s*)<\/body>/m;

/**
 * Adds the client bundle and its options to the HTML Verdaccio serves, so the
 * UI gets the OpenID login button and the usage info.
 */
export class PatchHtml implements PluginMiddleware {
  private readonly urlPrefix: string;
  private readonly optionsJson: string;
  private readonly entryScript: string;

  /**
   * @param config the plugin configuration to snapshot; read once here, not per request
   * @param entryScript the hashed client file named by the build manifest
   */
  constructor(config: ConfigHolder, entryScript: string) {
    this.urlPrefix = config.urlPrefix;
    // JSON.stringify escapes quotes; replacing "<" keeps a configured
    // "</script>" value from terminating the inline script block.
    this.optionsJson = JSON.stringify({
      keepPasswdLogin: config.keepPasswdLogin,
      loginButtonText: config.loginButtonText,
    }).replaceAll("<", String.raw`\u003C`);
    this.entryScript = entryScript;
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
      let body = html;

      try {
        const patched = this.patch(html, req);

        if (!isUndefined(patched)) {
          body = patched;
        }
      } catch (err: any) {
        logger.error({ message: err?.message ?? err }, "Failed to patch HTML: @{message}");
      }

      return originalSend.call(res, body, ...args);
    };
    next();
  };

  /**
   * Build the patched page.
   *
   * @param html the response body, as passed to `res.send`
   * @param req the current request, used for the public base URL
   * @returns the patched HTML, or `undefined` when the body is not a patchable Verdaccio page
   */
  private patch(html: unknown, req: Request): string | undefined {
    const htmlString = Buffer.isBuffer(html) ? html.toString() : html;

    if (typeof htmlString !== "string") return undefined;

    if (
      ![VERDACCIO_BASENAME_UI_OPTIONS_MARKER, VERDACCIO_UI_OPTIONS_SCRIPT_MARKER].some((marker) =>
        htmlString.includes(marker),
      )
    ) {
      return undefined;
    }

    const indent = BODY_LINE.exec(htmlString)?.[1];

    if (indent === undefined) return undefined;

    const baseUrl = getBaseUrl(this.urlPrefix, req, true);

    const scriptSrc = `${baseUrl}${staticPath}/${this.entryScript}`;
    const scriptTag = [
      `<script>`,
      `    window.__VERDACCIO_OPENID_OPTIONS=${this.optionsJson}`,
      `</script>`,
      `<script defer="defer" src="${scriptSrc}"></script>`,
      "",
    ]
      .map((line) => `${indent}${line}`)
      .join("");

    return htmlString.replace(BODY_LINE, () => `${scriptTag}</body>`);
  }
}
