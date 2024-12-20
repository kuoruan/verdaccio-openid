import { name, version } from "../package.json";

export const plugin = {
  name,
  version,
};

export const pluginKey = name.replace("verdaccio-", "");

export const replacedAttrKey = `data-${pluginKey}`;
export const replacedAttrValue = "1";

export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const loginHref = authorizePath;
export const logoutHref = "/";

export const cliPort = 8239;
export const cliProviderId = "cli";
export const cliAuthorizeUrl = "/oauth/authorize";

export const messageGroupRequired = "You are not a member of the required access group.";
