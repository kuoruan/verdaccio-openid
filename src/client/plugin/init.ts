import openIDLoginIcon from "@/assets/icon-lock.svg?raw";
import {
  defaultLoginButtonText,
  dialogOpenIDLoginTestId,
  dividerClass,
  helpLoginCommandSelector,
  loginButtonClass,
  loginButtonSelector,
  loginDialogSelector,
  logoutButtonSelector,
  SESSION_EXCHANGE_TIMEOUT_MS,
  updatedAttrKey,
} from "@/client/constants";
import { loginHref, logoutHref, sessionPath } from "@/constants";
import { parseQueryParams } from "@/query-params";

import {
  clearCredentials,
  type Credentials,
  isUITokenExpired,
  isValidCredentials,
  saveCredentials,
} from "./credentials";
import { resetLanguage, t } from "./i18n";
import { getBaseUrl, interruptClick, retry } from "./lib";
import { injectOpenIDStyles, syncUsage } from "./usage-panels";

/**
 * Drop the query params left over from the login redirect and reload.
 *
 * Uses `history.replaceState` rather than `location.href` so the redirect URL
 * does not end up in the browser history.
 */
function reloadToPathname() {
  history.replaceState(null, "", location.pathname);

  location.reload();
}

/**
 * Add an "or" divider and an OpenID Connect button below the password form in
 * the login dialog.
 *
 * @param callback runs when the button is clicked
 */
function addOpenIDLoginButton(callback: () => void): void {
  const loginDialog = document.querySelector(loginDialogSelector);

  if (!loginDialog || loginDialog.hasAttribute(updatedAttrKey)) return;

  // The header swaps its login button for a logout button once logged in, so a
  // dialog can outlive the node the button is cloned from.
  const loginButton = document.querySelector<HTMLElement>(loginButtonSelector);

  if (!loginButton) return;

  injectOpenIDStyles();

  resetLanguage();

  const divider = document.createElement("div");

  divider.className = dividerClass;
  divider.textContent = t("loginDialogDivider");

  // Preserve MUI typography and box sizing without duplicating its styles.
  const loginWithOpenIDButton = loginButton.cloneNode(false) as HTMLButtonElement;

  const label = document.createElement("span");

  label.textContent = window.__VERDACCIO_OPENID_OPTIONS?.loginButtonText || defaultLoginButtonText;

  loginWithOpenIDButton.classList.add(loginButtonClass);
  loginWithOpenIDButton.insertAdjacentHTML("beforeend", openIDLoginIcon);
  loginWithOpenIDButton.append(label);
  loginWithOpenIDButton.dataset.testid = dialogOpenIDLoginTestId;

  loginWithOpenIDButton.addEventListener("click", callback);

  loginDialog.append(divider, loginWithOpenIDButton);

  loginDialog.setAttribute(updatedAttrKey, "");
}

/**
 * By default the login button opens a form that asks the user to submit credentials.
 * We replace this behaviour and instead redirect to the route that handles OAuth.
 */
export async function init(): Promise<void> {
  const { code } = parseQueryParams(location.search);

  if (await didExchangeCredentials(code)) {
    reloadToPathname();
    return;
  }

  // A code that could not be exchanged must not stay in the URL: it is spent or
  // it never belonged to this browser, and the next login needs a clean address.
  if (code) {
    history.replaceState(null, "", location.pathname);
  }

  if (isUITokenExpired()) {
    clearCredentials();
  }

  const baseUrl = getBaseUrl(true);

  const gotoOpenIDLoginUrl = () => {
    location.assign(baseUrl + loginHref);
  };

  if (window.__VERDACCIO_OPENID_OPTIONS?.keepPasswdLogin) {
    const updateLoginDialog = () => addOpenIDLoginButton(gotoOpenIDLoginUrl);

    document.addEventListener("click", () => retry(updateLoginDialog, 2));
  } else {
    interruptClick(loginButtonSelector, gotoOpenIDLoginUrl);
  }

  interruptClick(logoutButtonSelector, () => {
    clearCredentials();

    location.assign(baseUrl + logoutHref);
  });

  // The UI mounts after this script runs, and the empty-registry guide only
  // renders once the package list request resolves (~400ms in a warm browser),
  // so poll until it is there. The bound is an upper bound for slow machines.
  retry(syncUsage, 10, () => document.querySelector(helpLoginCommandSelector) !== null);

  // Dialogs mount ~25ms after the click that opened them, history buttons fire
  // no click at all.
  document.addEventListener("click", () => retry(syncUsage, 3));
  window.addEventListener("popstate", () => retry(syncUsage, 2));
}

/**
 * Exchange the one-time code the login redirect leaves in the URL for the
 * credentials, and store them.
 *
 * The code alone is not enough: the server hands the credentials out only to the
 * browser that carries the cookie of the login it belongs to. Query parameters
 * are never trusted on their own, so a link cannot sign this browser in as
 * somebody else.
 *
 * @returns whether a complete set of credentials was stored
 */
async function didExchangeCredentials(code: string | undefined): Promise<boolean> {
  if (!code) {
    return false;
  }

  // A hung exchange must not keep the plugin from wiring the rest of the UI.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_EXCHANGE_TIMEOUT_MS);

  try {
    const response = await fetch(getBaseUrl(true) + sessionPath, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const credentials: Partial<Credentials> = await response.json();

    if (!isValidCredentials(credentials)) {
      return false;
    }

    saveCredentials(credentials);

    return true;
  } catch {
    // Storage or the request can fail; the login then does not stick.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
