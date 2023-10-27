import { loginHref, logoutHref } from "@/constants";
import { parseQueryParams } from "@/query-params";

import { clearCredentials, Credentials, saveCredentials, validateCredentials } from "./credentials";
import { interruptClick, retry } from "./lib";

/**
 * Change the current URL to only the current pathname and reload.
 * We don't use `location.href` because we want the query params
 * to be excluded from the history.
 */
function reloadToPathname() {
  history.replaceState(null, "", location.pathname);

  // reload the page to refetch the packages
  location.reload();
}

function saveAndRemoveQueryParams(): boolean {
  const credentials: Credentials = parseQueryParams(location.search);
  if (!validateCredentials(credentials)) {
    return false;
  }

  saveCredentials(credentials);

  return true;
}

//
// Shared API
//
export interface InitOptions {
  loginButton: string;
  logoutButton: string;
  updateUsageInfo: () => void;
}

//
// By default the login button opens a form that asks the user to submit credentials.
// We replace this behaviour and instead redirect to the route that handles OAuth.
//
export function init({ loginButton, logoutButton, updateUsageInfo }: InitOptions): void {
  if (saveAndRemoveQueryParams()) {
    // If we are new logged in, reload the page to remove the query params
    reloadToPathname();
    return;
  }

  interruptClick(loginButton, () => {
    location.href = loginHref;
  });

  interruptClick(logoutButton, () => {
    clearCredentials();

    location.href = logoutHref;
  });

  document.addEventListener("click", () => retry(updateUsageInfo));

  retry(updateUsageInfo);
}
