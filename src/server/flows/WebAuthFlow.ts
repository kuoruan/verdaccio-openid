/**
 * This is the npm WebAuth login flow.
 *
 * Known as the npm `--auth-type=web` command line argument.
 *
 * see: https://docs.npmjs.com/accessing-npm-using-2fa#sign-in-from-the-command-line-using---auth-typeweb
 *
 * This flow is described in verdaccio's discussions and issues:
 *   - https://github.com/orgs/verdaccio/discussions/1515
 *   - https://github.com/verdaccio/verdaccio/issues/3413
 *
 * First, npm login will make a POST request to your registry at endpoint `/-/v1/login` (e.g. https://registry.npmjs.org/-/v1/login).
 *
 * It expects in return a JSON body shaped like this:
 *
 *   ```json
 *   {
 *     "loginUrl": "https://www.npmjs.com/login?next=/login/cli/82737ae6-7557-4e7d-b3cb-edcc195aa34a",
 *     "doneUrl": "https://registry.npmjs.org/-/v1/done?sessionId=82737ae6-7557-4e7d-b3cb-edcc195aa34a"
 *   }
 *   ```
 *
 * Second, the NPM CLI will periodically call the `doneUrl`, which is responsible for letting it know when the user is successfully authenticated,
 * and returning the user's token afterward.
 *
 * It expects the server to return either:
 *   - A HTTP code `202`, along with an HTTP header `retry-after`, as long as the token is not available
 *   - A HTTP code `200` response, along with the token, once the login is successful
 *
 * The token must be put inside the response body as JSON:
 *   ```json
 *   {
 *     "token": "npm_token0123456789abcdef=="
 *   }
 *   ```
 *
 * Most likely for security reasons, once the token is successfully retrieved, the session matching the `sessionId` gets destroyed,
 * and the `doneUrl` is no longer available. Hence, one can use the `loginUrl` to fetch the token only once.
 *
 * Third, while the NPM CLI is waiting for the `doneUrl` to return a token, it offers to open up a web browser to the `loginUrl`.
 *
 * When the `adduser` command is used, the `/-/v1/login` endpoint is called with the `{"create":true}` body,
 * the response should be the same as above.
 */

import { errorUtils } from "@verdaccio/core";
import express, { type Application, type Handler } from "express";
import * as client from "openid-client";

import { messageLoggedAndCloseWindow, npmDonePath, npmLoginPath, webAuthnProviderId } from "@/constants";
import { getAuthorizePath, getCallbackPath } from "@/redirect";
import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider } from "@/server/plugin/AuthProvider";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { getBaseUrl } from "@/server/plugin/utils";
import type { Store } from "@/server/store/Store";
import { buildAccessDeniedPage, buildErrorPage, buildSuccessPage } from "@/status-page";

const PENDING_TOKEN = "__pending__";

const webAuthnAuthorizePath = getAuthorizePath(webAuthnProviderId);
const webAuthnCallbackPath = getCallbackPath(webAuthnProviderId);

export const SESSION_ID_LENGTH = 43; // openid-client default length for state parameter

export class WebAuthFlow implements PluginMiddleware {
  constructor(
    private readonly config: ConfigHolder,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider,
    private readonly store: Store,
  ) {}

  register_middlewares(app: Application): void {
    app.post(npmLoginPath, express.json(), this.login);
    app.get(npmDonePath, this.done);
    app.get(webAuthnAuthorizePath, this.authorize);
    app.get(webAuthnCallbackPath, this.callback);
  }

  login: Handler = async (req, res, next) => {
    try {
      const sessionId = client.randomState();

      await this.store.setWebAuthnToken(sessionId, PENDING_TOKEN);

      const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

      res.json({
        loginUrl: baseUrl + webAuthnAuthorizePath + `?sessionId=${sessionId}`,
        doneUrl: baseUrl + npmDonePath + `?sessionId=${sessionId}`,
      });
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");
      next(errorUtils.getInternalError(e.message ?? e));
    }
  };

  done: Handler = async (req, res, next) => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      next(errorUtils.getBadRequest("missing sessionId"));

      return;
    }

    if (sessionId.length !== SESSION_ID_LENGTH) {
      next(errorUtils.getBadRequest("invalid sessionId"));

      return;
    }

    try {
      const token = await this.store.getWebAuthnToken(sessionId);

      if (!token) {
        next(errorUtils.getUnauthorized("invalid or expired session"));

        return;
      }

      if (token === PENDING_TOKEN) {
        res.header("Retry-After", "3").status(202).json({});

        return;
      }

      await this.store.deleteWebAuthnToken(sessionId);

      res.json({ token });
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      void this.store.deleteWebAuthnToken(sessionId);

      return next(errorUtils.getInternalError(e.message ?? e));
    }
  };

  authorize: Handler = async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      res.status(400).send(buildErrorPage(new Error("missing sessionId")));

      return;
    }

    try {
      const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

      const redirectUrl = baseUrl + webAuthnCallbackPath;

      const url = await this.provider.getLoginUrl(redirectUrl, sessionId);
      res.redirect(url);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      void this.store.deleteWebAuthnToken(sessionId);
      res.status(500).send(buildErrorPage(e));
    }
  };

  callback: Handler = async (req, res) => {
    // The query parameter `state` is the sessionId, added by authorize api
    const sessionId = req.query.state as string | undefined;
    if (!sessionId) {
      res.status(400).send(buildErrorPage(new Error("missing sessionId")));

      return;
    }

    try {
      const providerToken = await this.provider.getToken(req);
      debug(`provider auth success, token: "%s"`, providerToken);

      const userinfo = await this.provider.getUserinfo(providerToken);

      const groups = this.core.getUserGroups(userinfo.name) ?? userinfo.groups;

      if (this.core.authenticate(userinfo.name, groups)) {
        const realGroups = this.core.filterRealGroups(userinfo.name, groups);

        debug(`user authenticated, name: "%s", groups: "%j"`, userinfo.name, realGroups);

        const npmToken = await this.core.issueNpmToken(userinfo.name, realGroups, providerToken);

        await this.store.setWebAuthnToken(sessionId, npmToken);

        res.status(200).send(buildSuccessPage(messageLoggedAndCloseWindow));
      } else {
        void this.store.deleteWebAuthnToken(sessionId);
        res.status(401).send(buildAccessDeniedPage());
      }
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      void this.store.deleteWebAuthnToken(sessionId);
      res.status(500).send(buildErrorPage(e));
    }
  };
}
