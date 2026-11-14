import { pluginKey } from "@/constants";

/**
 * Constants shared by the code that runs in the Verdaccio UI.
 *
 * Naming follows docs/development.md: literal tables and fixed literals use
 * `UPPER_SNAKE`, every other constant uses `camelCase`.
 */

/**
 * Selectors targeting the Verdaccio UI. Every one of them depends on the UI
 * markup, so they are kept together with the attribute names below.
 */
export const loginButtonSelector = `[data-testid="header--button-login"]`;
export const loginDialogSelector = `[data-testid="login--dialog"] .MuiDialogContent-root,[data-testid="dialogContentLogin"]`;
export const logoutButtonSelector = `[data-testid="header--button-logout"],[data-testid="logOutDialogIcon"]`;
export const usageTabsSelector = `[data-testid="tab-content"]`;
export const helpLoginCommandSelector = `[data-testid="help-login-command"]`;
export const helpLoginYarnPluginSelector = `[data-testid="help-login-yarn-plugin"]`;

/** Marks a DOM node the plugin already handled. */
export const updatedAttrKey = `data-${pluginKey}`;

/** Class names of the nodes the plugin injects into the Verdaccio UI. */
export const hintClass = "verdaccio-openid-hint";
export const commandRowClass = "verdaccio-openid-command";
export const dividerClass = "verdaccio-openid-divider";
export const loginButtonClass = "verdaccio-openid-login";

/** Matches the nodes the plugin injected into the usage info. */
export const usageRowSelector = `.${hintClass}, .${commandRowClass}`;

/** Test id of the login button the plugin adds to the password login dialog. */
export const dialogOpenIDLoginTestId = "dialogOpenIDLogin";

/** Id of the injected stylesheet. */
export const openIDStyleId = "verdaccio-openid-style";

/** Shown when `login-button-text` is not configured. */
export const defaultLoginButtonText = "Login with OpenID Connect";

/**
 * Key the UI stores the language picked in "Configuration → Translations" under.
 *
 * The value is JSON encoded, e.g. `"zh-CN"`.
 */
export const languageStorageKey = "language";

/** Language used when the UI has none. */
export const fallbackLanguage = "en-US";

/** Keys the plugin stores the logged-in credentials under. */
export const LOCAL_STORAGE_KEYS = {
  USERNAME: "username",
  UI_TOKEN: "token",
  NPM_TOKEN: "npm",
} as const;

/** Styles for the nodes the plugin injects, added once per page. */
export const openIDStyles = `
.${hintClass} {
  margin: 8px 0 0;
  font-size: 0.875rem;
  line-height: 1.43;
  opacity: 0.75;
}
.${dividerClass} {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}
.${dividerClass}::before,
.${dividerClass}::after {
  content: "";
  flex: 1;
  border-top: 1px solid currentColor;
  opacity: 0.4;
}
button.${loginButtonClass} {
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
button.${loginButtonClass} svg {
  width: 18px;
  height: 18px;
  flex: none;
}
button.${loginButtonClass}:hover,
button.${loginButtonClass}:focus-visible {
  background: rgba(128, 128, 128, 0.15);
}
`;
