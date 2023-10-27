import { plugin } from "@/constants";

import { copyToClipboard, getUsageInfo, init, isLoggedIn } from "./plugin";

const loginButtonSelector = `[data-testid="header--button-login"]`;
const logoutButtonSelector = `[data-testid="logOutDialogIcon"]`;
const tabSelector = `[data-testid="tab-content"]`;

const attrKey = `${plugin.name}-replaced`;
const attrValue = "1";

function updateUsageInfo(): void {
  const loggedIn = isLoggedIn();

  const tabs = document.querySelectorAll(tabSelector);
  if (!tabs) return;

  const usageInfoLines = getUsageInfo(loggedIn).split("\n").reverse();

  for (const tab of tabs) {
    const alreadyReplaced = tab.getAttribute(attrKey) === attrValue;
    if (alreadyReplaced) continue;

    const commands = [...tab.querySelectorAll("button")]
      .map((node) => node.parentElement!)
      .filter((node) => !!/^(npm|pnpm|yarn)/.test(node.textContent || ""));

    if (commands.length === 0) continue;

    for (const info of usageInfoLines) {
      const cloned = commands[0].cloneNode(true) as HTMLElement;

      const textEl = cloned.querySelector("span")!;
      textEl.textContent = info;

      const copyEl = cloned.querySelector("button")!;

      copyEl.style.visibility = loggedIn ? "visible" : "hidden";
      copyEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyToClipboard(info);
      });

      commands[0].parentElement!.append(cloned);
      tab.setAttribute(attrKey, attrValue);
    }

    // Remove commands that don't work with oauth
    for (const node of commands) {
      if (node.textContent?.includes("adduser") || node.textContent?.includes("set password")) {
        node.remove();
        tab.setAttribute(attrKey, attrValue);
      }
    }
  }
}

init({
  loginButton: loginButtonSelector,
  logoutButton: logoutButtonSelector,
  updateUsageInfo,
});
