/**
 * Replace the default npm usage info and displays the authToken that needs
 * to be configured
 */
import { getNPMToken } from "./credentials";

export function getUsageInfo(loggedIn: boolean): string {
  if (!loggedIn) {
    return "Click the login button to authenticate with OIDC.";
  }

  const configBase = window.VERDACCIO_API_URL
    ? window.VERDACCIO_API_URL.replace(/^https?:/, "").replace(/-\/verdaccio\/$/, "")
    : `//${location.host}/`;

  const authToken = getNPMToken();

  return `npm config set ${configBase}:_authToken "${authToken}"`;
}
