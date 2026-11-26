import { expectTypeOf } from "vitest";

import {
  escapeHtml,
  isNonEmptyString,
  isNull,
  isObject,
  isStringArray,
  isUndefOrNull,
  isUndefined,
  redactUrlCredentials,
  safeJsonParse,
  safeJsonStringify,
  safeUrl,
} from "@/utils";
import { STORE_VALUE_LABELS } from "@/server/store/constants";

describe("escapeHtml", () => {
  it("should escape the characters that end an attribute or start a tag", () => {
    expect(escapeHtml(`<a href="x">it's & more</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; more&lt;/a&gt;");
  });
});

describe("safeUrl", () => {
  it("should keep a path on this site", () => {
    expect(safeUrl("/-/web/detail?a=b")).toBe("/-/web/detail?a=b");
  });

  it("should refuse a protocol-relative path", () => {
    expect(safeUrl("//evil.example.com")).toBe("/");
  });

  it("should keep an absolute http or https URL", () => {
    expect(safeUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("should refuse a URL that runs script or embeds data", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("/");
    expect(safeUrl("JavaScript:alert(1)")).toBe("/");
    expect(safeUrl("data:text/html,x")).toBe("/");
  });

  it("should refuse a path that browsers would normalize to another host", () => {
    expect(safeUrl("/\\evil.example.com")).toBe("/");
    expect(safeUrl("/\tevil.example.com")).toBe("/");
    expect(safeUrl("/\nevil.example.com")).toBe("/");
    expect(safeUrl("/-/web/\u0000detail")).toBe("/");
  });

  it("should escape the target it keeps", () => {
    expect(safeUrl(`/-/web/detail?a="b"&c=<d>`)).toBe("/-/web/detail?a=&quot;b&quot;&amp;c=&lt;d&gt;");
  });

  it("should fall back to the target it was given", () => {
    expect(safeUrl("nonsense", "/-/web")).toBe("/-/web");
  });
});

describe("redactUrlCredentials", () => {
  it("hides the password of a proxy URL", () => {
    expect(redactUrlCredentials("http://user:s3cret@proxy.example.com:3128")).toBe(
      "http://user:***@proxy.example.com:3128/",
    );
  });

  it("hides the password of a socks proxy URL", () => {
    expect(redactUrlCredentials("socks5://user:s3cret@proxy.example.com:1080")).toBe(
      "socks5://user:***@proxy.example.com:1080",
    );
  });

  it("returns a URL without credentials unchanged", () => {
    expect(redactUrlCredentials("http://proxy.example.com:3128")).toBe("http://proxy.example.com:3128");
    expect(redactUrlCredentials("http://user@proxy.example.com")).toBe("http://user@proxy.example.com");
    // An `@` in the path or query is not a credential.
    expect(redactUrlCredentials("http://proxy.example.com/route@2")).toBe("http://proxy.example.com/route@2");
  });

  it("hides a value that cannot be parsed but looks like it holds credentials", () => {
    expect(redactUrlCredentials("user:s3cret@proxy")).toBe("***");
    expect(redactUrlCredentials("proxy.example.com:3128")).toBe("proxy.example.com:3128");
  });
});

describe("safeJsonParse", () => {
  it("keeps an optional expected type without validating the parsed shape", () => {
    const parsed = safeJsonParse<{ a: number }>('{"a":1}');

    expectTypeOf(parsed).toEqualTypeOf<{ a: number } | undefined>();
    expectTypeOf(safeJsonParse("{}")).toEqualTypeOf<unknown>();
    expect(parsed).toEqual({ a: 1 });
    expect(safeJsonParse<{ a: number }>("null")).toBeNull();
  });

  it("returns the parsed value on valid JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse("[1,2]")).toEqual([1, 2]);
  });

  it("passes scalars and null through instead of rejecting them", () => {
    expect(safeJsonParse("null")).toBeNull();
    expect(safeJsonParse("42")).toBe(42);
    expect(safeJsonParse('"s"')).toBe("s");
  });

  it("reports invalid JSON as undefined", () => {
    expect(safeJsonParse("not-json")).toBeUndefined();
    expect(safeJsonParse('{"a":}')).toBeUndefined();
    expect(safeJsonParse("")).toBeUndefined();
  });
});

describe("safeJsonStringify", () => {
  it("serializes the value it can represent", () => {
    expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
    expect(safeJsonStringify([1, 2])).toBe("[1,2]");
    expect(safeJsonStringify("s")).toBe('"s"');
  });

  it("reports a value with no JSON form as undefined", () => {
    expect(safeJsonStringify(undefined)).toBeUndefined();
    expect(safeJsonStringify(() => {})).toBeUndefined();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(safeJsonStringify(cyclic)).toBeUndefined();
  });

  it("round-trips through safeJsonParse", () => {
    const value = { username: "u", uiToken: "ui", npmToken: "npm" };
    expect(safeJsonParse(safeJsonStringify(value) as string)).toEqual(value);
  });
});

describe("nullish guards", () => {
  it("distinguishes undefined, null and falsy values", () => {
    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);
    expect(isUndefined(0)).toBe(false);
    expect(isUndefined("")).toBe(false);

    expect(isNull(null)).toBe(true);
    expect(isNull(undefined)).toBe(false);
    expect(isNull(0)).toBe(false);

    expect(isUndefOrNull(null)).toBe(true);
    expect(isUndefOrNull(undefined)).toBe(true);
    expect(isUndefOrNull(0)).toBe(false);
    expect(isUndefOrNull(false)).toBe(false);
    expect(isUndefOrNull("")).toBe(false);
  });
});

describe("isObject", () => {
  it("accepts objects and rejects null and primitives", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject("object")).toBe(false);
    expect(isObject(0)).toBe(false);
  });

  it("preserves an object branch and supports unknown input", () => {
    function ttl(value: { ttl: number } | string | undefined): number | undefined {
      if (!isObject(value)) return undefined;

      expectTypeOf(value).toEqualTypeOf<{ ttl: number }>();
      return value.ttl;
    }

    expect(ttl({ ttl: 5000 })).toBe(5000);
    expect(ttl("redis://localhost")).toBeUndefined();
    expect(ttl(undefined)).toBeUndefined();

    const value: unknown = { ttl: 5000 };
    if (isObject(value)) {
      expectTypeOf(value).toEqualTypeOf<Record<string, unknown>>();
      expect(value.ttl).toBe(5000);
    }
  });
});

describe("isNonEmptyString", () => {
  it("accepts strings that hold more than whitespace", () => {
    expect(isNonEmptyString("a")).toBe(true);
    expect(isNonEmptyString(" a ")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(1)).toBe(false);
  });
});

describe("isStringArray", () => {
  it("accepts arrays of strings and rejects mixed or non-string entries", () => {
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(["a", "b"])).toBe(true);
    expect(isStringArray(["a", 1])).toBe(false);
    expect(isStringArray("a")).toBe(false);
    expect(isStringArray(null)).toBe(false);
    expect(isStringArray(undefined)).toBe(false);
  });
});

describe("STORE_VALUE_LABELS", () => {
  it("covers every store kind", () => {
    expect(STORE_VALUE_LABELS).toEqual({
      state: "openid state nonce",
      userInfo: "user info payload",
      userGroups: "user groups payload",
      webAuthn: "webauthn token",
      loginResult: "login result",
    });
  });
});
