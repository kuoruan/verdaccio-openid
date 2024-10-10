import { loginHref, logoutHref, replacedAttrKey, replacedAttrValue } from "@/constants";
import { parseQueryParams } from "@/query-params";

import { copyToClipboard } from "./clipboard";
import {
  clearCredentials,
  type Credentials,
  isLoggedIn,
  isTokenExpired,
  saveCredentials,
  validateCredentials,
} from "./credentials";
import { getBaseUrl, interruptClick, retry } from "./lib";
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

function parseAndSaveCredentials(): boolean {
  const credentials: Partial<Credentials> = parseQueryParams(location.search);

  if (!validateCredentials(credentials)) {
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

    void copyToClipboard(info);
  });

  command.parentElement!.append(cloned);
}

// Remove commands that don't work with oauth
function removeInvalidCommands(commands: HTMLElement[]): void {
  for (const node of commands) {
    const content = node.textContent || "";

    if (content && (content.includes("adduser") || content.includes("set password"))) {
      node.remove();
    }
  }
}

function updateUsageTabs(usageTabsSelector: string): void {
  const tabs = [...document.querySelectorAll(usageTabsSelector)].filter(
    (node) => node.getAttribute(replacedAttrKey) !== replacedAttrValue,
  );

  if (tabs.length === 0) return;

  const loggedIn = isLoggedIn();

  const usageInfoLines = getUsageInfo(loggedIn).split("\n").reverse();

  for (const tab of tabs) {
    const commands = [...tab.querySelectorAll("button")]
      .map((node) => node.parentElement!)
      .filter((node) => !!/^(npm|pnpm|yarn)/.test(node.textContent || ""));

    if (commands.length === 0) continue;

    for (const info of usageInfoLines) {
      cloneAndAppendCommand(commands[0], info, loggedIn);
    }

    removeInvalidCommands(commands);

    tab.setAttribute(replacedAttrKey, replacedAttrValue);
  }
}

export interface InitOptions {
  loginButton: string;
  logoutButton: string;
  usageTabs: string;
}

//
// By default the login button opens a form that asks the user to submit credentials.
// We replace this behaviour and instead redirect to the route that handles OAuth.
//
export function init({ loginButton, logoutButton, usageTabs }: InitOptions): void {
  if (parseAndSaveCredentials()) {
    // If we are new logged in, reload the page to remove the query params
    reloadToPathname();
    return;
  }

  if (isTokenExpired()) {
    clearCredentials();
  }

  const baseUrl = getBaseUrl(true);

  interruptClick(loginButton, () => {
    location.href = baseUrl + loginHref;
  });

  interruptClick(logoutButton, () => {
    clearCredentials();

    location.href = baseUrl + logoutHref;
  });

  const updateUsageInfo = () => updateUsageTabs(usageTabs);

  document.addEventListener("click", () => retry(updateUsageInfo, 2));

  retry(updateUsageInfo);
}
