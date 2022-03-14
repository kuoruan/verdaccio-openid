import { name, version, bin } from "../package.json";

export const plugin = { name, version, bin };

export const pluginKey = plugin.name.replace("verdaccio-", "");
export const staticPath = `/-/static/${pluginKey}`;
export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const loginHref = authorizePath;
export const logoutHref = "/";

export const cliPort = 8239;
export const cliProviderId = "cli";
export const cliAuthorizeUrl = "/oauth/authorize";

/**
 * See https://verdaccio.org/docs/en/packages
 */
export const authenticatedUserGroups = ["$all", "@all", "$authenticated", "@authenticated", "all"] as const;
