import { init } from "./plugin";

const loginButtonSelector = `[data-testid="header--button-login"]`;
const loginDialogSelector = `[data-testid="login--dialog"] .MuiDialogContent-root,[data-testid="dialogContentLogin"]`;
const logoutButtonSelector = `[data-testid="header--button-logout"],[data-testid="logOutDialogIcon"]`;
const usageTabsSelector = `[data-testid="tab-content"]`;

init({
  loginButtonSelector,
  loginDialogSelector,
  logoutButtonSelector,
  usageTabsSelector,
});
