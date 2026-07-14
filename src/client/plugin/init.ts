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

const openIDStyleId = "verdaccio-openid-style";

const openIDLoginIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

function injectOpenIDStyles(): void {
  if (document.querySelector(`#${openIDStyleId}`)) return;

  const style = document.createElement("style");

  style.id = openIDStyleId;
  style.textContent = `
.verdaccio-openid-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 12px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}
.verdaccio-openid-divider::before,
.verdaccio-openid-divider::after {
  content: "";
  flex: 1;
  border-top: 1px solid currentColor;
  opacity: 0.4;
}
button.verdaccio-openid-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  border: 1px solid rgba(128, 128, 128, 0.5);
  border-radius: 4px;
  font-weight: 600;
  line-height: 1.75;
  color: inherit;
  background: transparent;
  cursor: pointer;
  transition: background-color 150ms ease;
}
button.verdaccio-openid-login:hover,
button.verdaccio-openid-login:focus-visible {
  background: rgba(128, 128, 128, 0.15);
}
`;
  document.head.append(style);
}

function addOpenIDLoginButton(loginDialogSelector: string, loginButtonSelector: string, callback: () => void): void {
  const loginDialog = document.querySelector(loginDialogSelector);

  if (!loginDialog || loginDialog.getAttribute(updatedAttrKey) === updatedAttrValue) return;

  const loginButton = document.querySelector(loginButtonSelector)!;

  injectOpenIDStyles();

  const divider = document.createElement("div");

  divider.className = "verdaccio-openid-divider";
  divider.textContent = "or";

  const loginWithOpenIDButton = loginButton.cloneNode(false) as HTMLButtonElement;

  const label = document.createElement("span");

  label.textContent = window.__VERDACCIO_OPENID_OPTIONS?.loginButtonText || "Login with OpenID Connect";

  loginWithOpenIDButton.classList.add("verdaccio-openid-login");
  loginWithOpenIDButton.insertAdjacentHTML("beforeend", openIDLoginIcon);
  loginWithOpenIDButton.append(label);
  loginWithOpenIDButton.dataset.testid = "dialogOpenIDLogin";

  loginWithOpenIDButton.addEventListener("click", callback);

  loginDialog.append(divider, loginWithOpenIDButton);

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
