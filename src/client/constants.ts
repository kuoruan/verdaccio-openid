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

/**
 * Marks a host row this plugin hides.
 *
 * The scoped `[hidden]` rule relies on it so the plugin never overrides
 * `display` on rows it does not own.
 */
export const hiddenMarker = `data-${pluginKey}-hidden`;

/** How long the client waits for the login code exchange before giving up. */
export const SESSION_EXCHANGE_TIMEOUT_MS = 30_000;

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
