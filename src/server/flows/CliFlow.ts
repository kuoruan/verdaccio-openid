import qs from "qs";

import { cliPort, cliProviderId } from "@/constants";
import logger from "@/logger";
import { getCallbackPath } from "@/redirect";

import { AuthCore } from "../plugin/AuthCore";
import { AuthProvider } from "../plugin/AuthProvider";
import { Verdaccio } from "../plugin/Verdaccio";

import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler } from "express";

const pluginCallbackeUrl = getCallbackPath(cliProviderId);

export class CliFlow implements IPluginMiddleware<any> {
  constructor(
    private readonly verdaccio: Verdaccio,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider
  ) {}

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    app.get(pluginCallbackeUrl, this.callback);
  }

  callback: Handler = async (req, res) => {
    const params: Record<string, string> = {};

    try {
      const code = this.provider.getCode(req);

      const token = await this.provider.getToken(code, pluginCallbackeUrl);
      const [username, groups] = await Promise.all([this.provider.getUsername(token), this.provider.getGroups(token)]);

      if (this.core.authenticate(username, groups)) {
        const user = await this.core.createAuthenticatedUser(username, groups);
        const npmToken = await this.verdaccio.issueNpmToken(token, user);

        params.status = "success";
        params.token = encodeURIComponent(npmToken);
      } else {
        params.status = "denied";
      }
    } catch (error: any) {
      logger.error(error);

      params.status = "error";
      params.message = error.message || error;
    }

    const redirectUrl = `http://localhost:${cliPort}?${qs.stringify(params)}`;

    res.redirect(redirectUrl);
  };
}
