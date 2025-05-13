import { name, version } from "../package.json";

export const plugin = { name, version };

export const pluginKey = name.replace("verdaccio-", "");

export const updatedAttrKey = `data-${pluginKey}`;
export const updatedAttrValue = "1";

export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const sessionPath = "/-/oauth/session";
export const loginHref = authorizePath;
export const logoutHref = "/";

export const cliPort = 8239;
export const cliProviderId = "cli";

export const npmLoginPath = "/-/v1/login";
export const npmDonePath = "/-/v1/done";
export const webAuthnProviderId = "authn";

export const messageGroupRequired = "You are not a member of the required access group.";
export const messageLoggedAndCloseWindow = "You have logged in successfully and may close this window.";
