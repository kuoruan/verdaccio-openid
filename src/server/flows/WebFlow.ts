import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler } from "express";

import { stringifyQueryParams } from "@/query-params";
import { getAuthorizePath, getCallbackPath } from "@/redirect";
import logger, { debug } from "@/server/logger";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider, ConfigHolder } from "@/server/plugin/AuthProvider";
import { getBaseUrl } from "@/server/plugin/utils";
import { buildAccessDeniedPage, buildErrorPage } from "@/status-page";

export class WebFlow implements IPluginMiddleware<any> {
  constructor(
    private readonly config: ConfigHolder,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider,
  ) {}

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    app.get(getAuthorizePath(), this.authorize);
    app.get(getCallbackPath(), this.callback);
  }

  /**
   * Initiates the auth flow by redirecting to the provider's login URL.
   */
  authorize: Handler = async (req, res, next) => {
    try {
      const url = this.provider.getLoginUrl(req);
      res.redirect(url);
    } catch (e: any) {
      logger.error({ message: e.message || e }, "auth error: @{message}");
      next(e);
    }
  };

  /**
   * After successful authentication, the auth provider redirects back to us.
   * We use the code in the query params to get an access token and the username
   * associated with the account.
   *
   * We issue a JWT using these values and pass them back to the frontend as
   * query parameters so they can be stored in the browser.
   *
   * The username and token are encrypted and base64 encoded to form a token for
   * the npm CLI.
   *
   * There is no need to later decode and decrypt the token. This process is
   * automatically reversed by verdaccio before passing it to the plugin.
   */
  callback: Handler = async (req, res) => {
    const withBackButton = true;

    const baseUrl = getBaseUrl(this.config.urlPrefix, req);

    try {
      const providerToken = await this.provider.getToken(req);
      debug(`provider auth success, token: "%s"`, providerToken);

      const userinfo = await this.provider.getUserinfo(providerToken);

      let groups = this.core.getUserGroups(userinfo.name);
      if (!groups) {
        groups = userinfo.groups;
      }

      if (this.core.authenticate(userinfo.name, groups)) {
        const realGroups = this.core.filterRealGroups(userinfo.name, groups);

        debug(`user authenticated, name: "%s", groups: "%j"`, userinfo.name, realGroups);

        const uiToken = await this.core.issueUiToken(userinfo.name, realGroups);
        const npmToken = await this.core.issueNpmToken(userinfo.name, realGroups, providerToken);

        const params = { username: userinfo.name, uiToken, npmToken };

        const redirectUrl = `${baseUrl}?${stringifyQueryParams(params)}`;

        res.redirect(redirectUrl);
      } else {
        res.status(401).send(buildAccessDeniedPage(withBackButton, baseUrl));
      }
    } catch (e: any) {
      logger.error({ message: e.message || e }, "auth error: @{message}");

      res.status(500).send(buildErrorPage(e, withBackButton, baseUrl));
    }
  };
}
