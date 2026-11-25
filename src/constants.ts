import { name, version } from "../package.json";

export const plugin = { name, version };

export const pluginKey = name.replace("verdaccio-", "");

export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const sessionPath = "/-/oauth/session";
export const loginHref = authorizePath;
export const logoutHref = "/";

export const cliProviderId = "cli";

/** How long the CLI waits for the browser to report back before it gives up. */
export const CLI_TIMEOUT_MS = 60_000;

/** How long the CLI lets the launcher take to start the browser before falling back to the URL. */
export const CLI_OPEN_BROWSER_TIMEOUT_MS = 5_000;

/** How long the CLI waits between web-login polls when the server says nothing. */
export const CLI_WEB_LOGIN_POLL_INTERVAL_MS = 2_000;

/** The longest gap the CLI leaves between web-login polls, whatever the server asks for. */
export const CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS = 5_000;

export const npmLoginPath = "/-/v1/login";
export const npmDonePath = "/-/v1/done";
export const webAuthnProviderId = "authn";

/** Answer for a CLI that still calls the removed loopback login routes. */
export const messageCliUpgrade =
  "this login flow is no longer supported: CLI 0.20.0 and older must upgrade to " +
  "0.21.0 or newer (npx verdaccio-openid@latest)";

export const messageNpmConfigUpdated = "All done. We've updated your npm configuration.";
export const messageGroupRequired = "You are not a member of the required access group.";
export const messageLoggedAndCloseWindow = "You have logged in successfully and may close this window.";
