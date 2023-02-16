import type { IPluginMiddleware } from "@verdaccio/types";
import type { Application, Handler } from "express";

import { stringifyQueryParams } from "@/query-params";
import { getAuthorizePath, getCallbackPath } from "@/redirect";
import { buildAccessDeniedPage, buildErrorPage } from "@/status-page";

import logger, { debug } from "../logger";
import { AuthCore } from "../plugin/AuthCore";
import { AuthProvider } from "../plugin/AuthProvider";

export class WebFlow implements IPluginMiddleware<any> {
  constructor(private readonly core: AuthCore, private readonly provider: AuthProvider) {}

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

    try {
      const providerToken = await this.provider.getToken(req);
      debug(`provider auth success, token: "%s"`, providerToken);

      const username = await this.provider.getUsername(providerToken);

      let groups = this.core.getUserGroups(username);
      if (!groups) {
        groups = await this.provider.getGroups(providerToken);
      }

      if (this.core.authenticate(username, groups)) {
        const realGroups = this.core.filterRealGroups(username, groups);

        debug(`user authenticated, name: "%s", groups: "%o"`, username, realGroups);

        const user = this.core.createAuthenticatedUser(username, realGroups);

        const uiToken = await this.core.issueUiToken(user, providerToken);
        const npmToken = await this.core.issueNpmToken(user, providerToken);

        const params = { username: user.name!, uiToken, npmToken };

        const redirectUrl = `/?${stringifyQueryParams(params)}`;

        res.redirect(redirectUrl);
      } else {
        res.status(401).send(buildAccessDeniedPage(withBackButton));
      }
    } catch (e: any) {
      logger.error({ message: e.message || e }, "auth error: @{message}");

      res.status(500).send(buildErrorPage(e, withBackButton));
    }
  };
}
