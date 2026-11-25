import type { Application, Handler } from "express";

import { cliProviderId, messageCliUpgrade } from "@/constants";
import { getAuthorizePath, getCallbackPath } from "@/paths";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { buildErrorPage } from "@/status-page";

const cliAuthorizePath = getAuthorizePath(cliProviderId);
const cliCallbackPath = getCallbackPath(cliProviderId);

/**
 * Compat routes for the removed loopback CLI login, answering old clients with an upgrade notice.
 *
 * The CLI no longer listens on a local port: it follows npm's web login
 * protocol instead, and the server never puts a token in a redirect. The old
 * routes stay reachable so an outdated CLI gets an explanation, not a 404.
 */
export class CliFlow implements PluginMiddleware {
  register_middlewares(app: Application) {
    app.get(cliAuthorizePath, this.upgrade);
    app.get(cliCallbackPath, this.upgrade);
  }

  /** Tell an old CLI which login flow to use. */
  upgrade: Handler = (_req, res) => {
    res.status(400).send(buildErrorPage(new Error(messageCliUpgrade), false));
  };
}
