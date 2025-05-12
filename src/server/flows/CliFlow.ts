import type { Application, Handler } from "express";

import { cliPort, cliProviderId } from "@/constants";
import { stringifyQueryParams } from "@/query-params";
import { getAuthorizePath, getCallbackPath } from "@/redirect";
import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider } from "@/server/plugin/AuthProvider";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { getBaseUrl } from "@/server/plugin/utils";

const cliAuthorizePath = getAuthorizePath(cliProviderId);
const cliCallbackPath = getCallbackPath(cliProviderId);

export class CliFlow implements PluginMiddleware {
  constructor(
    private readonly config: ConfigHolder,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider,
  ) {}

  register_middlewares(app: Application) {
    app.get(cliAuthorizePath, this.authorize);
    app.get(cliCallbackPath, this.callback);
  }

  authorize: Handler = async (req, res, next) => {
    try {
      const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

      const redirectUrl = baseUrl + cliCallbackPath;

      const url = await this.provider.getLoginUrl(redirectUrl);
      res.redirect(url);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");
      next(e);
    }
  };

  callback: Handler = async (req, res) => {
    const params: Record<string, string> = {};

    try {
      const providerToken = await this.provider.getToken(req);

      debug(`provider auth success, tokens: "%j"`, providerToken);

      const userinfo = await this.provider.getUserinfo(providerToken);

      const groups = this.core.getUserGroups(userinfo.name) ?? userinfo.groups;

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
      params.message = error.message ?? error;

      logger.error({ message: params.message }, "auth error: @{message}");
    }

    const redirectUrl = `http://localhost:${cliPort}?${stringifyQueryParams(params)}`;

    res.redirect(redirectUrl);
  };
}
