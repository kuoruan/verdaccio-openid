/**
 * Constants shared by every bundle: the server, the CLI and the browser.
 */
import { name, version } from "../package.json";

export const plugin = { name, version };

export const pluginKey = name.replace("verdaccio-", "");

export const authorizePath = "/-/oauth/authorize";
export const callbackPath = "/-/oauth/callback";
export const sessionPath = "/-/oauth/session";
export const loginHref = authorizePath;
export const logoutHref = "/";

export const npmLoginPath = "/-/v1/login";
export const npmDonePath = "/-/v1/done";

/** A token is a JWT or a base64url string; nothing outside this set can be one. */
export const AUTH_TOKEN_REGEX = /^[A-Za-z0-9_\-+/=.]{1,4096}$/;
