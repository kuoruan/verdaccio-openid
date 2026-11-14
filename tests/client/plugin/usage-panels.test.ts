// @vitest-environment jsdom
/**
 * Tests for the usage info injected into the Verdaccio UI.
 *
 * The fixtures copy the markup Verdaccio renders: command rows holding a text
 * node plus a copy button and a visually hidden live region, and the empty
 * registry guide with its yarn alternative block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getNPMToken } = vi.hoisted(() => ({ getNPMToken: vi.fn(() => "test-token") }));

vi.mock("@/client/plugin/credentials", () => ({
  getNPMToken,
  isLoggedIn: vi.fn(),
  isOpenIDLoggedIn: vi.fn(),
}));

import { isLoggedIn, isOpenIDLoggedIn } from "@/client/plugin/credentials";
import { syncUsage } from "@/client/plugin/usage-panels";

const row = (command: string, testId?: string) => `
  <div class="css-row" style="display: flex">
    <span class="css-text">${command}</span>
    <button type="button" data-testid="${testId ?? "copy"}" aria-label="Copy to clipboard"></button>
    <span aria-live="polite"></span>
  </div>`;

const panels = () => `
  <div data-testid="tab-content">
    ${row("npm set registry http://localhost:4873/")}
    ${row("npm adduser --registry http://localhost:4873/")}
    ${row("npm profile set password --registry http://localhost:4873/")}
  </div>
  <div data-testid="tab-content">${row('# bunfig.toml\n[install]\nregistry = "http://localhost:4873/"')}</div>`;

const guideRow = () => `
  <div class="css-code">
    <div class="css-row">
      <span class="css-text"><code>npm adduser --registry http://localhost:4873/</code></span>
      <button type="button" data-testid="help-login-command" aria-label="Copy to clipboard"></button>
      <span aria-live="polite"></span>
    </div>
    <div data-testid="help-login-yarn-plugin">
      ${row("yarn npm login --registry http://localhost:4873/", "help-login-yarn-command")}
      ${row("yarn dlx @verdaccio/yarn-import npm-login", "help-login-yarn-plugin-install")}
    </div>
  </div>`;

const guide = () => `<ol data-testid="help-guide"><li>${guideRow()}</li></ol>`;

/** The localStorage keys Verdaccio and the plugin write on a login. */
interface Session {
  username?: string;
  token?: string;
  npm?: string;
}

const LAYOUT = `<main>${panels()}${guide()}</main>`.replaceAll(/>\s+</g, "><");

const tokenCmd = (token: string) => `npm config set //${location.host}/:_authToken '${token}'`;

const hint = () => document.querySelector<HTMLElement>(".verdaccio-openid-hint");
const commandRows = () => [...document.querySelectorAll<HTMLElement>(".verdaccio-openid-command")];
const panelText = (index = 0) =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="tab-content"]')[index].querySelectorAll(".css-row")].map(
    (node) => node.textContent?.trim(),
  );

/** Fill localStorage the way Verdaccio and the plugin leave it after a login. */
function setSession({ username, token, npm }: Session): void {
  window.localStorage.clear();

  if (username) window.localStorage.setItem("username", username);
  if (token) window.localStorage.setItem("token", token);
  if (npm) window.localStorage.setItem("npm", npm);
}

describe("syncUsage", () => {
  beforeEach(() => {
    document.body.innerHTML = LAYOUT;
    window.localStorage.clear();
    window.__VERDACCIO_OPENID_OPTIONS = { keepPasswdLogin: false, loginButtonText: "Login" };
    getNPMToken.mockReturnValue("test-token");
    vi.mocked(isLoggedIn).mockReturnValue(false);
    vi.mocked(isOpenIDLoggedIn).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes password commands and adds a plain hint when only OIDC can log in", () => {
    syncUsage();

    expect(panelText()).toEqual(["npm set registry http://localhost:4873/"]);
    expect(hint()?.textContent).toBe("Sign in with OpenID Connect to get an auth token.");
  });

  it("keeps password commands and frames OIDC as an alternative while password login works", () => {
    window.__VERDACCIO_OPENID_OPTIONS = { keepPasswdLogin: true, loginButtonText: "Login" };

    syncUsage();

    expect(panelText().slice(0, 3)).toEqual([
      "npm set registry http://localhost:4873/",
      "npm adduser --registry http://localhost:4873/",
      "npm profile set password --registry http://localhost:4873/",
    ]);
    expect(hint()?.textContent).toMatch(/^Or /);
  });

  it("shows the token command after an OpenID Connect login", () => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(isOpenIDLoggedIn).mockReturnValue(true);
    setSession({ username: "oidc", token: "ui", npm: "npm-token" });
    getNPMToken.mockReturnValue("npm-token");

    syncUsage();

    expect(commandRows().map((node) => node.textContent?.trim())).toContain(tokenCmd("npm-token"));
    expect(panelText().join(" ")).not.toContain("adduser");
  });

  it("leaves the UI untouched for a password session", () => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    setSession({ username: "pw", token: "ui" });
    const before = document.body.innerHTML;

    syncUsage();

    expect(document.body.innerHTML).toBe(before);
  });

  it("does not rebuild the injected node on repeated syncs", () => {
    syncUsage();
    const [first] = commandRows().concat(hint() as HTMLElement);

    // The host leaves its copy feedback in the row it cloned.
    document.querySelector('[aria-live="polite"]')!.textContent = "Copied";
    syncUsage();

    expect(hint()).toBe(first);
    expect(document.querySelectorAll('[data-testid="tab-content"] .verdaccio-openid-hint').length).toBe(1);
  });

  it("does not copy host hooks into the injected command row", () => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(isOpenIDLoggedIn).mockReturnValue(true);
    setSession({ username: "oidc", token: "ui", npm: "npm-token" });

    syncUsage();

    const [injected] = commandRows();

    expect(injected.querySelectorAll("[data-testid], [id]")).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid="help-login-command"]')).toHaveLength(1);
  });

  it("hides the yarn alternative in the guide when password login is gone", () => {
    syncUsage();

    expect(document.querySelector<HTMLElement>('[data-testid="help-login-command"]')!.parentElement!.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-testid="help-login-yarn-plugin"]')!.hidden).toBe(true);
    expect(document.querySelector('[data-testid="help-guide"] .verdaccio-openid-hint')?.textContent).toBe(
      "Sign in with OpenID Connect to get an auth token.",
    );
  });

  it("keeps the whole guide visible while password login works", () => {
    window.__VERDACCIO_OPENID_OPTIONS = { keepPasswdLogin: true, loginButtonText: "Login" };

    syncUsage();

    expect(document.querySelector<HTMLElement>('[data-testid="help-login-command"]')!.parentElement!.hidden).toBe(
      false,
    );
    expect(document.querySelector<HTMLElement>('[data-testid="help-login-yarn-plugin"]')!.hidden).toBe(false);
    expect(document.querySelector('[data-testid="help-login-yarn-command"]')).not.toBeNull();
  });

  it("re-renders the hint after the UI language changes", () => {
    syncUsage();
    expect(hint()?.textContent).toBe("Sign in with OpenID Connect to get an auth token.");

    window.localStorage.setItem("language", JSON.stringify("zh-CN"));
    syncUsage();

    expect(hint()?.textContent).toBe("使用 OpenID Connect 登录后可获取认证 token。");
  });

  it("copies the injected command, not the one it replaced", () => {
    vi.mocked(isLoggedIn).mockReturnValue(true);
    vi.mocked(isOpenIDLoggedIn).mockReturnValue(true);
    setSession({ username: "oidc", token: "ui", npm: "npm-token" });
    getNPMToken.mockReturnValue("npm-token");
    const writeText = vi.fn(() => Promise.resolve());

    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    syncUsage();
    commandRows()[0].querySelector("button")!.click();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(tokenCmd("npm-token"));
  });
});
