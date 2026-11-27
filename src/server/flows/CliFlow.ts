import type { Application, Handler } from "express";

import { cliProviderId, messageCliUpgrade } from "@/server/constants";
import { getAuthorizePath, getCallbackPath } from "@/paths";
import type { PluginMiddleware } from "@/server/plugin/Plugin";
import { buildErrorPage } from "@/status-page";
import { isUndefined } from "@/utils";

const cliAuthorizePath = getAuthorizePath(cliProviderId);
const cliCallbackPath = getCallbackPath(cliProviderId);

/** The ports a loopback-era CLI listened on, default first. */
const LEGACY_CLI_PORTS = ["8239", "18239"];

/**
 * Routes that answer a loopback-era CLI with an upgrade notice.
 *
 * The CLI follows npm's web login protocol, and the server never puts a token
 * in a redirect. These paths stay reachable so an outdated CLI gets an
 * explanation, not a 404.
 */
export class CliFlow implements PluginMiddleware {
  register_middlewares(app: Application) {
    app.get(cliAuthorizePath, this.upgrade);
    app.get(cliCallbackPath, this.upgrade);
  }

  /**
   * Tell an old CLI which login flow to use.
   *
   * Such a CLI waits for the browser to come back to its loopback port and has
   * no timeout of its own, so sending the browser there with an error status is
   * what makes it print the notice and exit instead of hanging. It renders the
   * same page itself, so the notice still reaches the user.
   */
  upgrade: Handler = (req, res) => {
    // Before 0.18.0, the CLI omitted the port and listened on the default one.
    const port = isUndefined(req.query.port) ? LEGACY_CLI_PORTS[0] : req.query.port;

    // Only the ports a loopback-era CLI listened on may receive the redirect.
    if (typeof port !== "string" || !LEGACY_CLI_PORTS.includes(port)) {
      res.status(400).send(buildErrorPage(new Error(messageCliUpgrade), false));

      return;
    }

    const callback = new URL(`http://localhost:${port}/`);

    callback.searchParams.set("status", "error");
    callback.searchParams.set("message", messageCliUpgrade);
    res.redirect(callback.href);
  };
}
