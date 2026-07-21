import { loginHref, logoutHref, pluginKey } from "@/constants";
import { parseQueryParams } from "@/query-params";

import {
  clearCredentials,
  type Credentials,
  isLoggedIn,
  isOpenIDLoggedIn,
  isUITokenExpired,
  isValidCredentials,
  saveCredentials,
} from "./credentials";
import { copyToClipboard, getBaseUrl, interruptClick, retry } from "./lib";
import { getUsageInfo } from "./usage-info";

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

function didParseAndSavedCredentials(): boolean {
  const credentials: Partial<Credentials> = parseQueryParams(location.search);

  if (!isValidCredentials(credentials)) {
    return false;
  }

  saveCredentials(credentials);

  return true;
}

function cloneAndAppendCommand(command: HTMLElement, info: string, isLoggedIn: boolean): void {
  const cloned = command.cloneNode(true) as HTMLElement;

  const textEl = cloned.querySelector("span")!;
  textEl.textContent = info;

  const copyEl = cloned.querySelector("button")!;

  copyEl.style.visibility = isLoggedIn ? "visible" : "hidden";
  copyEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    void copyToClipboard(info).catch((e) => console.warn(e));
  });

  command.parentElement!.append(cloned);
}

/**
 * Remove commands that don't work with oauth
 *
 * @param commands {HTMLElement[]} - The commands to be removed
 */
function removeInvalidCommands(commands: HTMLElement[]): void {
  for (const node of commands) {
    const content = node.textContent || "";

    if (content && (content.includes("adduser") || content.includes("set password"))) {
      node.remove();
    }
  }
}

const updatedAttrKey = `data-${pluginKey}`;
const updatedAttrValue = "1";

function updateUsageTabs(usageTabsSelector: string): void {
  const isLoggedInViaOpenID = isOpenIDLoggedIn();

  if (!isLoggedInViaOpenID && isLoggedIn()) {
    // If we are logged in but not with OpenID, we don't need to update the usage info
    return;
  }

  const tabs = [...document.querySelectorAll(usageTabsSelector)].filter(
    (node) => node.getAttribute(updatedAttrKey) !== updatedAttrValue,
  );

  if (tabs.length === 0) return;

  const usageInfoLines = getUsageInfo(isLoggedInViaOpenID).split("\n").toReversed();

  for (const tab of tabs) {
    const commands = [...tab.querySelectorAll("button")]
      .map((node) => node.parentElement!)
      .filter((node) => !!/^(npm|pnpm|yarn)/.test(node.textContent || ""));

    if (commands.length === 0) continue;

    for (const info of usageInfoLines) {
      cloneAndAppendCommand(commands[0], info, isLoggedInViaOpenID);
    }

    removeInvalidCommands(commands);

    tab.setAttribute(updatedAttrKey, updatedAttrValue);
  }
}

function addOpenIDLoginButton(loginDialogSelector: string, loginButtonSelector: string, callback: () => void): void {
  const loginDialog = document.querySelector(loginDialogSelector);

  if (!loginDialog || loginDialog.getAttribute(updatedAttrKey) === updatedAttrValue) return;

  const loginButton = document.querySelector(loginButtonSelector)!;

  const loginWithOpenIDButton = loginButton.cloneNode(false) as HTMLButtonElement;

  loginWithOpenIDButton.textContent = window.__VERDACCIO_OPENID_OPTIONS?.loginButtonText || "Login with OpenID Connect";
  loginWithOpenIDButton.dataset.testid = "dialogOpenIDLogin";

  loginWithOpenIDButton.addEventListener("click", callback);

  loginDialog.append(loginWithOpenIDButton);

  loginDialog.setAttribute(updatedAttrKey, updatedAttrValue);
}

export interface InitOptions {
  loginButtonSelector: string;
  loginDialogSelector: string;
  logoutButtonSelector: string;
  usageTabsSelector: string;
}

/**
 * By default the login button opens a form that asks the user to submit credentials.
 * We replace this behaviour and instead redirect to the route that handles OAuth.
 */
export function init({
  loginButtonSelector,
  logoutButtonSelector,
  usageTabsSelector,
  loginDialogSelector,
}: InitOptions): void {
  if (didParseAndSavedCredentials()) {
    // If we are new logged in, reload the page to remove the query params
    reloadToPathname();
    return;
  }

  if (isUITokenExpired()) {
    clearCredentials();
  }

  const baseUrl = getBaseUrl(true);

  const gotoOpenIDLoginUrl = () => {
    location.assign(baseUrl + loginHref);
  };

  if (window.__VERDACCIO_OPENID_OPTIONS?.keepPasswdLogin) {
    const updateLoginDialog = () => addOpenIDLoginButton(loginDialogSelector, loginButtonSelector, gotoOpenIDLoginUrl);

    document.addEventListener("click", () => retry(updateLoginDialog, 2));
  } else {
    interruptClick(loginButtonSelector, gotoOpenIDLoginUrl);
  }

  interruptClick(logoutButtonSelector, () => {
    clearCredentials();

    location.assign(baseUrl + logoutHref);
  });

  const updateUsageInfo = () => updateUsageTabs(usageTabsSelector);

  document.addEventListener("click", () => retry(updateUsageInfo, 2));
}
