import type { Application, Handler } from "express";

import { getAuthorizePath, getCallbackPath } from "@/paths";
import { stringifyQueryParams } from "@/query-params";
import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider } from "@/server/plugin/AuthProvider";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { getBaseUrl } from "@/server/plugin/utils";
import { buildAccessDeniedPage, buildErrorPage } from "@/status-page";

const webAuthorizePath = getAuthorizePath();
const webCallbackPath = getCallbackPath();

export class WebFlow implements PluginMiddleware {
  constructor(
    private readonly config: ConfigHolder,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider,
  ) {}

  register_middlewares(app: Application) {
    app.get(webAuthorizePath, this.authorize);
    app.get(webCallbackPath, this.callback);
  }

  /** Send the visitor to the provider, remembering the request state. */
  authorize: Handler = async (req, res) => {
    const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

    try {
      const redirectUrl = baseUrl + webCallbackPath;

      const url = await this.provider.getLoginUrl(redirectUrl);
      res.redirect(url);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      res.status(500).send(buildErrorPage(e, { backUrl: baseUrl }));
    }
  };

  /**
   * Handle the provider redirect: exchange the code for a token, then create
   * the UI token and the npm token for the account.
   *
   * Both tokens are passed to the frontend as query parameters, where the client
   * stores them in `localStorage`.
   *
   * Verdaccio reverses the encryption of the npm token before passing it back to
   * the plugin, so nothing here needs to decode it.
   */
  callback: Handler = async (req, res) => {
    const baseUrl = getBaseUrl(this.config.urlPrefix, req);

    try {
      const providerToken = await this.provider.getToken(req);

      debug("provider auth success");

      const userinfo = await this.provider.getUserinfo(providerToken);

      const groups = this.core.getUserGroups(userinfo.name) ?? userinfo.groups;

      if (this.core.authenticate(userinfo.name, groups)) {
        const realGroups = this.core.filterRealGroups(userinfo.name, groups);

        debug(`user authenticated, name: "%s", groups: "%j"`, userinfo.name, realGroups);

        const uiToken = await this.core.issueUiToken(userinfo.name, realGroups);
        const npmToken = await this.core.issueNpmToken(userinfo.name, realGroups, providerToken);

        const params = { username: userinfo.name, uiToken, npmToken };

        const redirectUrl = `${baseUrl}?${stringifyQueryParams(params)}`;

        res.redirect(redirectUrl);
      } else {
        res.status(401).send(buildAccessDeniedPage({ backUrl: baseUrl }));
      }
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      res.status(500).send(buildErrorPage(e, { backUrl: baseUrl }));
    }
  };
}
