import { name, version } from "../package.json";

export const plugin = {
  name,
  version,
};

export const pluginKey = plugin.name.replace("verdaccio-", "");
export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const loginHref = authorizePath;
export const logoutHref = "/";

export const cliName = plugin.name;
export const cliPort = 8239;
export const cliProviderId = "cli";
export const cliAuthorizeUrl = "/oauth/authorize";
