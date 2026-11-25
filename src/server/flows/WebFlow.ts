import type { Application, Handler } from "express";
import express from "express";

import { sessionPath } from "@/constants";
import { getAuthorizePath, getCallbackPath } from "@/paths";
import { stringifyQueryParams } from "@/query-params";
import type { ConfigHolder } from "@/server/config/Config";
import type { LoginResult, LoginResultStore } from "@/server/store/Store";
import { debug } from "@/server/debugger";
import logger from "@/server/logger";
import { getOpenIDClient } from "@/server/openid/client";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider } from "@/server/plugin/AuthProvider";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { clearLoginCookie, getBaseUrl, getLoginCookie, setLoginCookie } from "@/server/plugin/utils";

import { buildAccessDeniedPage, buildErrorPage } from "@/status-page";

const webAuthorizePath = getAuthorizePath();
const webCallbackPath = getCallbackPath();

export class WebFlow implements PluginMiddleware {
  constructor(
    private readonly config: ConfigHolder,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider,
    private readonly store: LoginResultStore,
  ) {}

  register_middlewares(app: Application) {
    app.get(webAuthorizePath, this.authorize);
    app.get(webCallbackPath, this.callback);
    app.post(sessionPath, express.json(), this.session);
  }

  /** Send the visitor to the provider, remembering the request state. */
  authorize: Handler = async (req, res) => {
    const baseUrl = getBaseUrl(this.config.urlPrefix, req, true);

    try {
      const redirectUrl = baseUrl + webCallbackPath;

      // The state is also the name of the login in the store, and the value the
      // browser has to present when it comes back, so a flow started in another
      // browser cannot be finished here.
      const openidClient = await getOpenIDClient();
      const state = openidClient.randomState();

      const url = await this.provider.getLoginUrl(redirectUrl, state);

      setLoginCookie(res, req, this.config.urlPrefix, "ui", state);
      res.redirect(url);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      res.status(500).send(buildErrorPage(e, { backUrl: baseUrl }));
    }
  };

  /**
   * Handle the provider redirect: exchange the code for a token, then store the
   * UI token and the npm token for the browser that started the flow to collect.
   */
  callback: Handler = async (req, res) => {
    const baseUrl = getBaseUrl(this.config.urlPrefix, req);

    try {
      const state = req.query.state;

      // Only the browser that started this login may finish it. Without this,
      // a login started elsewhere could be completed here with another account.
      if (typeof state !== "string" || !state || getLoginCookie(req, "ui") !== state) {
        res
          .status(400)
          .send(buildErrorPage(new Error("login state does not match this browser"), { backUrl: baseUrl }));

        return;
      }

      const providerToken = await this.provider.getToken(req);

      debug("provider auth success");

      const userinfo = await this.provider.getUserinfo(providerToken);

      const groups = this.core.getUserGroups(userinfo.name) ?? userinfo.groups;

      if (!this.core.authenticate(userinfo.name, groups)) {
        clearLoginCookie(res, req, this.config.urlPrefix, "ui");
        res.status(401).send(buildAccessDeniedPage({ backUrl: baseUrl }));

        return;
      }

      const realGroups = this.core.filterRealGroups(userinfo.name, groups);

      debug(`user authenticated, name: "%s", groups: "%j"`, userinfo.name, realGroups);

      const uiToken = await this.core.issueUiToken(userinfo.name, realGroups);
      const npmToken = await this.core.issueNpmToken(userinfo.name, realGroups, providerToken);

      const result: LoginResult = { username: userinfo.name, uiToken, npmToken };

      await this.store.setLoginResult(state, result);

      // The tokens never travel in a URL: the browser asks for them by state,
      // presenting the cookie, and reads them once.
      const redirectUrl = `${baseUrl}?${stringifyQueryParams({ code: state })}`;

      setLoginCookie(res, req, this.config.urlPrefix, "ui", state);
      res.redirect(redirectUrl);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      clearLoginCookie(res, req, this.config.urlPrefix, "ui");
      res.status(500).send(buildErrorPage(e, { backUrl: baseUrl }));
    }
  };

  /** Hand the credentials of a finished login to the browser that started it. */
  session: Handler = async (req, res) => {
    const code = req.body?.code;

    if (typeof code !== "string" || !code) {
      res.status(400).json({ error: "missing code" });

      return;
    }

    if (getLoginCookie(req, "ui") !== code) {
      res.status(401).json({ error: "login does not belong to this browser" });

      return;
    }

    let result: LoginResult | undefined;

    try {
      result = await this.store.takeLoginResult(code);
    } catch (e: any) {
      logger.error({ message: e.message ?? e }, "auth error: @{message}");

      res.status(500).json({ error: "login failed" });

      return;
    }

    if (!result) {
      res.status(401).json({ error: "login expired" });

      return;
    }

    clearLoginCookie(res, req, this.config.urlPrefix, "ui");
    res.json(result);
  };
}
