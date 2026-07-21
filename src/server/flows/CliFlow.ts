import type { Application, Handler } from "express";

import { buildCliState, parseCliPort } from "@/cli-state";
import { cliPort, cliProviderId } from "@/constants";
import { getAuthorizePath, getCallbackPath } from "@/paths";
import { stringifyQueryParams } from "@/query-params";
import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider } from "@/server/plugin/AuthProvider";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { getBaseUrl } from "@/server/plugin/utils";
import { buildErrorPage } from "@/status-page";

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

  authorize: Handler = async (req, res) => {
    const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

    try {
      const redirectUrl = baseUrl + cliCallbackPath;

      // The CLI's actual listening port must travel through the OIDC round-trip to
      // reach the callback handler so we can redirect back to the right port.
      //
      // Flow: CLI ?port=N → this handler reads req.query.port →
      //       buildCliState(port) → OIDC state param → callback handler →
      //       parseCliPort(state) → localhost redirect with the correct port.
      const port = req.query.port as string | undefined;
      const customState = port && /^\d+$/.test(port) ? buildCliState(port) : undefined;

      const url = await this.provider.getLoginUrl(redirectUrl, customState);
      res.redirect(url);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      res.status(500).send(buildErrorPage(e, false));
    }
  };

  callback: Handler = async (req, res) => {
    const params: Record<string, string> = {};

    try {
      const providerToken = await this.provider.getToken(req);

      debug("provider auth success");

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

    const port = parseCliPort(req.query.state as string | undefined) ?? cliPort;

    const redirectUrl = `http://localhost:${port}?${stringifyQueryParams(params)}`;

    res.redirect(redirectUrl);
  };
}
