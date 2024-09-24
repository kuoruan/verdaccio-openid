import { init } from "./plugin";

const loginButtonSelector = `[data-testid="header--button-login"]`;
const logoutButtonSelector = `[data-testid="header--button-logout"],[data-testid="logOutDialogIcon"]`;
const usageTabsSelector = `[data-testid="tab-content"]`;

init({
  loginButton: loginButtonSelector,
  logoutButton: logoutButtonSelector,
  usageTabs: usageTabsSelector,
});
