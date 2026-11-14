/**
 * The npm WebAuth login flow, used by `npm login --auth-type=web`.
 *
 * See https://docs.npmjs.com/accessing-npm-using-2fa#sign-in-from-the-command-line-using---auth-typeweb.
 *
 * The flow is described in Verdaccio's discussions and issues:
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
 * Second, the npm CLI polls the `doneUrl`, which reports when the user has authenticated
 * and returns the user's token.
 *
 * It expects the server to return either:
 *   - an HTTP `202` with a `retry-after` header while the token is not available
 *   - an HTTP `200` with the token once the login succeeded
 *
 * The token must be put inside the response body as JSON:
 *   ```json
 *   {
 *     "token": "npm_token0123456789abcdef=="
 *   }
 *   ```
 *
 * Once the token has been retrieved, the session matching `sessionId` is destroyed and
 * `doneUrl` stops responding: the `loginUrl` can fetch the token only once.
 *
 * Third, while the npm CLI waits for `doneUrl`, it offers to open a browser at `loginUrl`.
 *
 * When the `adduser` command is used, the `/-/v1/login` endpoint is called with the `{"create":true}` body,
 * the response should be the same as above.
 */

import { errorUtils } from "@verdaccio/core";
import express, { type Application, type Handler } from "express";

import { messageLoggedAndCloseWindow, npmDonePath, npmLoginPath, webAuthnProviderId } from "@/constants";
import { getAuthorizePath, getCallbackPath } from "@/paths";
import type { ConfigHolder } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { getOpenIDClient } from "@/server/openid/client";
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
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]+$/;

export function isValidSessionId(sessionId: string): boolean {
  return sessionId.length === SESSION_ID_LENGTH && SESSION_ID_REGEX.test(sessionId);
}

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
      const openidClient = await getOpenIDClient();
      const sessionId = openidClient.randomState();

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

    if (!isValidSessionId(sessionId)) {
      next(errorUtils.getBadRequest("invalid sessionId"));

      return;
    }

    try {
      const token = await this.store.takeWebAuthnToken(sessionId, PENDING_TOKEN);

      if (!token) {
        next(errorUtils.getUnauthorized("invalid or expired session"));

        return;
      }

      if (token === PENDING_TOKEN) {
        res.header("Retry-After", "3").status(202).json({});

        return;
      }

      res.json({ token });
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      return next(errorUtils.getInternalError(e.message ?? e));
    }
  };

  authorize: Handler = async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      res.status(400).send(buildErrorPage(new Error("missing sessionId")));

      return;
    }

    if (!isValidSessionId(sessionId)) {
      res.status(400).send(buildErrorPage(new Error("invalid sessionId")));

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

    if (!isValidSessionId(sessionId)) {
      res.status(400).send(buildErrorPage(new Error("invalid sessionId")));

      return;
    }

    try {
      const sessionToken = await this.store.getWebAuthnToken(sessionId);

      if (sessionToken !== PENDING_TOKEN) {
        res.status(401).send(buildErrorPage(new Error("invalid or expired session")));

        return;
      }

      const providerToken = await this.provider.getToken(req);

      debug("provider auth success");

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
