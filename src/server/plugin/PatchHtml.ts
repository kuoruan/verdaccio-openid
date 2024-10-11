import fs from "node:fs";

import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler, Request } from "express";

import { plugin } from "@/constants";
import { publicRoot, staticPath } from "@/server/constants";

import type { ConfigHolder } from "./Config";
import { getBaseUrl } from "./utils";

/**
 * Injects additional static imports into the DOM with code from the client folder
 * that modifies the login button.
 */
export class PatchHtml implements IPluginMiddleware<any> {
  private readonly scriptName: string;

  constructor(private readonly config: ConfigHolder) {
    const scriptName = this.getScriptName();

    if (!scriptName) {
      throw new Error("Could not find script to inject");
    }

    this.scriptName = scriptName;
  }

  private getScriptName(): string | undefined {
    return fs.readdirSync(publicRoot).find((file) => file.startsWith("verdaccio") && file.endsWith(".js"));
  }

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    app.use(this.patchResponse);
  }

  /**
   * Patches `res.send` in order to inject style and script tags.
   */
  patchResponse: Handler = (req, res, next) => {
    const send = res.send;

    res.send = (html) => {
      html = this.insertTags(html, req);
      return send.call(res, html);
    };
    next();
  };

  private insertTags(html: string | Buffer, req: Request): string {
    html = String(html);
    if (!html.includes("__VERDACCIO_BASENAME_UI_OPTIONS")) {
      return html;
    }

    const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

    const scriptSrc = `${baseUrl}${staticPath}/${this.scriptName}`;

    return html.replace(
      /<\/body>/,
      [
        `<!-- inject start, ${plugin.name}: ${plugin.version} -->`,
        `<script defer="defer" src="${scriptSrc}"></script>`,
        "<!-- inject end -->",
        "</body>",
      ].join(""),
    );
  }
}
