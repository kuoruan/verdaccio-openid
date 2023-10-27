import fs from "node:fs";

import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler } from "express";

import { plugin } from "@/constants";

import { publicRoot, staticPath } from "../constants";

/**
 * Injects additional static imports into the DOM with code from the client folder
 * that modifies the login button.
 */
export class PatchHtml implements IPluginMiddleware<any> {
  private readonly scriptTag: string;

  constructor() {
    const scriptName = this.getScriptName();

    if (!scriptName) {
      throw new Error("Could not find script to inject");
    }

    this.scriptTag = `<script defer src="${staticPath}/${scriptName}"></script>`;
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
  patchResponse: Handler = (_, res, next) => {
    const send = res.send;
    res.send = (html) => {
      html = this.insertTags(html);
      return send.call(res, html);
    };
    next();
  };

  private insertTags(html: string | Buffer): string {
    html = String(html);
    if (!html.includes("__VERDACCIO_BASENAME_UI_OPTIONS")) {
      return html;
    }
    return html.replace(
      /<\/body>/,
      [
        `<!-- inject start, ${plugin.name}: ${plugin.version} -->`,
        this.scriptTag,
        "<!-- inject end -->",
        "</body>",
      ].join(""),
    );
  }
}
