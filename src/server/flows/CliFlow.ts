import type { IPluginMiddleware } from "@verdaccio/types";
import { Application, Handler } from "express";

import { cliPort, cliProviderId } from "@/constants";
import { stringifyQueryParams } from "@/query-params";
import { getCallbackPath } from "@/redirect";

import logger, { debug } from "../logger";
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

      debug(`provider auth success, tokens: "%j"`, providerToken);

      const userinfo = await this.provider.getUserinfo(providerToken);

      let groups = this.core.getUserGroups(userinfo.name);
      if (!groups) {
        groups = userinfo.groups;
      }

      if (this.core.authenticate(userinfo.name, groups)) {
        const realGroups = this.core.filterRealGroups(userinfo.name, groups);

        debug(`user authenticated, name: "%s", groups: %j`, userinfo.name, realGroups);

        const npmToken = await this.core.issueNpmToken(userinfo.name, realGroups, providerToken);

        params.status = "success";
        params.token = npmToken;
      } else {
        params.status = "denied";
      }
    } catch (error: any) {
      params.status = "error";
      params.message = error.message || error;

      logger.error({ message: params.message }, "auth error: @{message}");
    }

    const redirectUrl = `http://localhost:${cliPort}?${stringifyQueryParams(params)}`;

    res.redirect(redirectUrl);
  };
}
