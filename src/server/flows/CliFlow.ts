import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler } from "express";

import { cliPort, cliProviderId } from "@/constants";
import { stringifyQueryParams } from "@/query-params";
import { getCallbackPath } from "@/redirect";

import logger from "../logger";
import { AuthCore } from "../plugin/AuthCore";
import { AuthProvider } from "../plugin/AuthProvider";

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
      logger.debug({ providerToken }, `provider auth success, token: "@{providerToken}"`);

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

    const redirectUrl = `http://localhost:${cliPort}?${stringifyQueryParams(params)}`;

    res.redirect(redirectUrl);
  };
}
