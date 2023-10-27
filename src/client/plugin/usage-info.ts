//
// Replace the default npm usage info and displays the authToken that needs
// to be configured.
//
export function getUsageInfo(isLoggedIn: boolean): string {
  if (!isLoggedIn) {
    return "Click the login button to authenticate with OIDC.";
  }

  const configBase = window.VERDACCIO_API_URL
    ? window.VERDACCIO_API_URL.replace(/^https?:/, "").replace(/-\/verdaccio\/$/, "")
    : `//${location.host}/`;
  const authToken = localStorage.getItem("npm");
  return `npm config set ${configBase}:_authToken "${authToken}"`;
}
