// @vitest-environment jsdom
/**
 * Tests for the browser helpers that more than one client module needs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBaseUrl } from "@/client/utils";

describe("getBaseUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { protocol: "https:", host: "registry.example" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses `base` from the UI options when provided", () => {
    vi.stubGlobal("window", { __VERDACCIO_BASENAME_UI_OPTIONS: { base: "https://cdn.example/ui/" } });

    expect(getBaseUrl()).toBe("https://cdn.example/ui/");
    expect(getBaseUrl(true)).toBe("https://cdn.example/ui");
  });

  it("strips every trailing slash when asked to", () => {
    vi.stubGlobal("window", { __VERDACCIO_BASENAME_UI_OPTIONS: { base: "https://cdn.example/ui//" } });

    expect(getBaseUrl()).toBe("https://cdn.example/ui//");
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

  it.each<[label: string, prefix: string | undefined, expected: string]>([
    ["no slashes", "foo", "https://registry.example/foo/"],
    ["trailing slash only", "foo/", "https://registry.example/foo/"],
    ["leading slash only", "/foo", "https://registry.example/foo/"],
    ["both slashes", "/foo/", "https://registry.example/foo/"],
    ["nested path", "a/b", "https://registry.example/a/b/"],
    ["a doubled leading slash, which is not deduped", "//foo", "https://registry.example//foo/"],
    ["a doubled trailing slash, which is not deduped", "/foo//", "https://registry.example/foo//"],
  ])("wraps a `url_prefix` with %s in slashes", (_label, prefix, expected) => {
    vi.stubGlobal("window", { __VERDACCIO_BASENAME_UI_OPTIONS: { url_prefix: prefix } });

    expect(getBaseUrl()).toBe(expected);
  });
});
