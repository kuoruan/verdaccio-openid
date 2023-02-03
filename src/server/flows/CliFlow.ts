import { cliPort, cliProviderId } from "@/constants";
import logger from "@/logger";
import { getCallbackPath } from "@/redirect";

import { AuthCore } from "../plugin/AuthCore";
import { AuthProvider } from "../plugin/AuthProvider";

import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler } from "express";

const pluginCallbackeUrl = getCallbackPath(cliProviderId);

export class CliFlow implements IPluginMiddleware<any> {
  constructor(private readonly core: AuthCore, private readonly provider: AuthProvider) {}

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    app.get(pluginCallbackeUrl, this.callback);
  }

  callback: Handler = async (req, res) => {
    const params: Record<string, string> = {};

    try {
      const providerToken = await this.provider.getToken(req);
      const username = await this.provider.getUsername(providerToken);

      let groups = this.core.getUserGroups(username);

      if (!groups) {
        groups = await this.provider.getGroups(username);
      }

      if (this.core.authenticate(username, groups)) {
        const user = await this.core.createAuthenticatedUser(username, groups);
        const npmToken = await this.core.issueNpmToken(user, providerToken);

        params.status = "success";
        params.token = npmToken;
      } else {
        params.status = "denied";
      }
    } catch (error: any) {
      logger.error(error);

      params.status = "error";
      params.message = error.message || error;
    }

    const redirectUrl = `http://localhost:${cliPort}?${new URLSearchParams(params).toString()}`;

    res.redirect(redirectUrl);
  };
}
