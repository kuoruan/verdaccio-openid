import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copyToClipboard, getBaseUrl, parseJwt, retry, wrapPrefix } from "@/client/plugin/lib";

// Mock window for Node.js environment
vi.stubGlobal("window", {
  atob: (str: string) => {
    return Buffer.from(str, "base64").toString("binary");
  },
});

describe("parseJwt", () => {
  it("should parse valid JWT token", () => {
    // JWT with payload: { sub: "user123", name: "Test User" }
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwibmFtZSI6IlRlc3QgVXNlciJ9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ";

    const payload = parseJwt(token);

    expect(payload).toEqual({ sub: "user123", name: "Test User" });
  });

  it("should return null for token with less than 3 parts", () => {
    expect(parseJwt("onlyTwoParts.parts")).toBeNull();
    expect(parseJwt("justOne")).toBeNull();
    expect(parseJwt("")).toBeNull();
  });

  it("should return null for token with empty payload part", () => {
    expect(parseJwt("header..signature")).toBeNull();
  });

  it("should return null for invalid base64 payload", () => {
    // Invalid base64 (special characters that can't be decoded)
    expect(parseJwt("header.!!!invalid!!!.signature")).toBeNull();
  });

  it("should return null for invalid JSON payload", () => {
    // base64url-encoded "{invalid json" (not valid JSON)
    const base64url = Buffer.from("{invalid json").toString("base64").replaceAll("+", "-").replaceAll("/", "_");
    expect(parseJwt(`header.${base64url}.signature`)).toBeNull();
  });

  it("should handle base64url encoding (- and _ instead of + and /)", () => {
    // Manually create a JWT with base64url encoding using - and _
    // payload: { test: "base64url±test" }
    const payload = Buffer.from('{"test":"base64url"}').toString("base64url");
    const token = `header.${payload}.signature`;

    const result = parseJwt(token);

    expect(result).toEqual({ test: "base64url" });
  });

  it("should handle multi-byte UTF-8 characters in payload", () => {
    // payload: { emoji: "🍀", chinese: "中文" }
    const payload = Buffer.from('{"emoji":"🍀","chinese":"中文"}')
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
    const token = `header.${payload}.signature`;

    const result = parseJwt(token);

    expect(result).toEqual({ emoji: "🍀", chinese: "中文" });
  });
});

describe("wrapPrefix", () => {
  it.each<[label: string, input: string | undefined, expected: string]>([
    ["undefined", undefined, ""],
    ["empty string", "", ""],
    ["no slashes", "foo", "/foo/"],
    ["trailing slash only", "foo/", "/foo/"],
    ["leading slash only", "/foo", "/foo/"],
    ["both slashes", "/foo/", "/foo/"],
    ["nested path", "a/b", "/a/b/"],
    ["does not dedupe a doubled leading slash", "//foo", "//foo/"],
    ["does not dedupe a doubled trailing slash", "/foo//", "/foo//"],
  ])("wraps %s with a leading and trailing slash", (_label, input, expected) => {
    expect(wrapPrefix(input)).toBe(expected);
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
});

describe("getBaseUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { protocol: "https:", host: "registry.example" });
  });

  it("uses `base` from the UI options when provided", () => {
    vi.stubGlobal("window", { __VERDACCIO_BASENAME_UI_OPTIONS: { base: "https://cdn.example/ui/" } });

    expect(getBaseUrl()).toBe("https://cdn.example/ui/");
    expect(getBaseUrl(true)).toBe("https://cdn.example/ui");
  });

  it("constructs the base from `location` when `base` is absent and no prefix is set", () => {
    vi.stubGlobal("window", {});

    expect(getBaseUrl()).toBe("https://registry.example");
    expect(getBaseUrl(true)).toBe("https://registry.example");
  });

  it("appends a normalized `url_prefix`", () => {
    vi.stubGlobal("window", { __VERDACCIO_BASENAME_UI_OPTIONS: { url_prefix: "prefix" } });

    expect(getBaseUrl()).toBe("https://registry.example/prefix/");
    expect(getBaseUrl(true)).toBe("https://registry.example/prefix");
  });
});

describe("copyToClipboard", () => {
  it("writes the text via navigator.clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });
});
