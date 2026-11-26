import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getNPMToken } = vi.hoisted(() => ({ getNPMToken: vi.fn(() => "test-token") }));

vi.mock("@/client/credentials", () => ({ getNPMToken }));

import { isPasswordAuthCommand, loginHint, tokenCommand, usageVariant } from "@/client/usage-info";

describe("usageVariant", () => {
  it("keeps the rendered commands for a password session", () => {
    expect(usageVariant({ isOpenIDLoggedIn: false, isLoggedIn: true, keepPasswdLogin: true })).toBe("keep");
    expect(usageVariant({ isOpenIDLoggedIn: false, isLoggedIn: true, keepPasswdLogin: false })).toBe("keep");
  });

  it("frames OpenID Connect as an alternative while password login works", () => {
    expect(usageVariant({ isOpenIDLoggedIn: false, isLoggedIn: false, keepPasswdLogin: true })).toBe("alternative");
  });

  it("hints at OpenID Connect when it is the only way in", () => {
    expect(usageVariant({ isOpenIDLoggedIn: false, isLoggedIn: false, keepPasswdLogin: false })).toBe("hint");
  });

  it("shows the token command after an OpenID Connect login", () => {
    expect(usageVariant({ isOpenIDLoggedIn: true, isLoggedIn: true, keepPasswdLogin: true })).toBe("token");
  });
});

describe("loginHint", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames OpenID Connect as an alternative when asked", () => {
    expect(loginHint(true)).toBe("Or sign in with OpenID Connect to get an auth token.");
  });

  it("states OpenID Connect plainly otherwise", () => {
    expect(loginHint(false)).toBe("Sign in with OpenID Connect to get an auth token.");
  });
});

describe("tokenCommand", () => {
  beforeEach(() => {
    getNPMToken.mockReturnValue("test-token");
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:4873" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the command from the UI base URL", () => {
    vi.stubGlobal("window", {
      __VERDACCIO_BASENAME_UI_OPTIONS: { base: "https://registry.example.com/" },
    });

    expect(tokenCommand()).toBe("npm config set //registry.example.com/:_authToken 'test-token'");
  });

  it("normalizes a base URL that ends with several slashes", () => {
    vi.stubGlobal("window", {
      __VERDACCIO_BASENAME_UI_OPTIONS: { base: "https://registry.example.com//" },
    });

    expect(tokenCommand()).toBe("npm config set //registry.example.com/:_authToken 'test-token'");
  });

  it("falls back to the page host", () => {
    expect(tokenCommand()).toBe("npm config set //localhost:4873/:_authToken 'test-token'");
  });

  it("uses the token from the credentials module", () => {
    getNPMToken.mockReturnValue("other-token");

    expect(tokenCommand()).toContain("_authToken 'other-token'");
  });

  it("escapes a quote instead of ending the shell quoting", () => {
    getNPMToken.mockReturnValue("a'b");

    expect(tokenCommand()).toBe(String.raw`npm config set //localhost:4873/:_authToken 'a'\''b'`);
  });
});

describe("isPasswordAuthCommand", () => {
  it("recognises the commands Verdaccio renders", () => {
    expect(isPasswordAuthCommand("npm adduser --registry http://localhost:4873/")).toBe(true);
    expect(isPasswordAuthCommand("pnpm adduser --registry http://localhost:4873/")).toBe(true);
    expect(isPasswordAuthCommand("npm profile set password --registry http://localhost:4873/")).toBe(true);
    expect(isPasswordAuthCommand("npm set password --registry http://localhost:4873/")).toBe(true);
  });

  it("keeps registry, install and publish commands", () => {
    expect(isPasswordAuthCommand("npm set registry http://localhost:4873/")).toBe(false);
    expect(isPasswordAuthCommand("yarn config set registry http://localhost:4873/")).toBe(false);
    expect(isPasswordAuthCommand('npm config set //localhost:4873/:_authToken "x"')).toBe(false);
    expect(isPasswordAuthCommand("bun publish --registry http://localhost:4873/")).toBe(false);
  });

  it("does not match a registry URL that merely contains the word", () => {
    expect(isPasswordAuthCommand("npm set registry https://adduser.example.com/")).toBe(false);
    expect(isPasswordAuthCommand("pnpm set registry https://registry.example.com/set-password")).toBe(false);
  });

  it("only matches at the start of the command", () => {
    expect(isPasswordAuthCommand("echo npm adduser")).toBe(false);
  });
});
