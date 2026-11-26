import { getPublicUrl } from "@verdaccio/url";
import type { Request } from "express";

import { ERRORS, LOGIN_COOKIE_NAMES } from "@/server/constants";
import { base64Decode, base64Encode, getClaimsFromIdToken, hashObject, signHmac, verifyHmac } from "@/server/crypto";
import { clearLoginCookie, getCookie, setLoginCookie } from "@/server/cookies";
import {
  getAllConfiguredGroups,
  getAuthenticatedGroups,
  getBaseUrl,
  getFullUrl,
  getPackageSpec,
  isNowBefore,
} from "@/server/plugin/utils";

import { cookiesOf, fakeResponse } from "@root/tests/helpers/express";

vi.mock("@verdaccio/url", () => ({
  getPublicUrl: vi.fn().mockReturnValue("http://localhost/"),
}));

describe("getCookie", () => {
  const request = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as Request;

  it("should read the cookie it is asked for", () => {
    expect(getCookie(request("a=1; openid-login-ui=abc; b=2"), LOGIN_COOKIE_NAMES.ui)).toBe("abc");
  });

  it("should decode the value the way it was encoded", () => {
    expect(getCookie(request(`${LOGIN_COOKIE_NAMES.ui}=a%2Fb`), LOGIN_COOKIE_NAMES.ui)).toBe("a/b");
  });

  it("should return undefined when it is not there", () => {
    expect(getCookie(request("a=1"), LOGIN_COOKIE_NAMES.ui)).toBeUndefined();
    expect(getCookie(request(), LOGIN_COOKIE_NAMES.ui)).toBeUndefined();
  });
});

describe("setLoginCookie", () => {
  const request = { headers: { host: "registry.example.com" }, protocol: "https" } as Request;

  it("should keep the binding cookie for five minutes", () => {
    const res = fakeResponse();
    const cookie = vi.fn(res.cookie);

    res.cookie = cookie;
    setLoginCookie(res as any, request, "", "ui", "state-123");

    // Express takes milliseconds and serializes them as seconds.
    expect(cookie.mock.calls[0][2]).toMatchObject({ maxAge: 5 * 60 * 1000 });
  });

  it("should confine the login cookie to the browser", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/");

    const res = fakeResponse();

    setLoginCookie(res as any, request, "", "ui", "state-123");

    const cookie = cookiesOf(res)[LOGIN_COOKIE_NAMES.ui];

    expect(cookie.value).toBe("state-123");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.secure).toBe(true);
    expect(cookie.path).toBe("/");
  });

  it("should not mark it secure when the registry is served over http", () => {
    const res = fakeResponse();

    setLoginCookie(
      res as any,
      { headers: { host: "localhost:4873" }, protocol: "http" } as Request,
      "",
      "ui",
      "state-123",
    );

    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.ui].secure).not.toBe(true);
  });

  it("should clear it when the login is over", () => {
    const res = fakeResponse();
    const clear = vi.fn(res.clearCookie);

    res.clearCookie = clear;
    clearLoginCookie(res as any, request, "", "ui");

    // Express 4 forwards the options it receives, so a lingering maxAge would
    // win over the expired date and the cookie would stay.
    expect(clear.mock.calls[0][1]).not.toHaveProperty("maxAge");
    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.ui].expires).toEqual(new Date(0));
    expect(cookiesOf(res)[LOGIN_COOKIE_NAMES.ui].maxAge).toBeUndefined();
  });
});

describe("base64Encode", () => {
  it("should encode string to base64", () => {
    expect(base64Encode("test")).toBe("dGVzdA");
    expect(base64Encode("t e s t")).toBe("dCBlIHMgdA");
  });
});

describe("base64Decode", () => {
  it("should decode base64 string", () => {
    expect(base64Decode("dGVzdA")).toBe("test");
    expect(base64Decode("dCBlIHMgdA")).toBe("t e s t");
  });
});

describe("hashObject", () => {
  it("should return string directly if input is string", () => {
    expect(hashObject("test")).toBe("test");
  });

  it("should hash object to sha256", () => {
    const obj = { test: "value" };
    expect(hashObject(obj)).toMatchInlineSnapshot(`"#test:"value","`);
  });

  it("should get the same hash for the same object", () => {
    const hash1 = hashObject({ test: "value", b: "a" });
    const hash2 = hashObject({ b: "a", test: "value" });

    expect(hash1).toMatchInlineSnapshot(`"#test:"value",b:"a","`);
    expect(hash1).toBe(hash2);
  });
});

describe("getClaimsFromIdToken", () => {
  it("should extract claims from id token", () => {
    const token = "header.eyJ0ZXN0IjoidmFsdWUifQ.signature";
    expect(getClaimsFromIdToken(token)).toEqual({ test: "value" });
  });

  it("should throw on invalid token format", () => {
    expect(() => getClaimsFromIdToken("invalid")).toThrow(ERRORS.INVALID_ID_TOKEN);
  });
});

describe("isNowBefore", () => {
  it("should return true if now is before expireAt", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isNowBefore(future)).toBe(true);
  });

  it("should return false if now is after expireAt", () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(isNowBefore(past)).toBe(false);
  });
});

describe("signHmac", () => {
  it("should sign the same value the same way", () => {
    expect(signHmac("payload", "secret")).toBe(signHmac("payload", "secret"));
  });

  it("should sign differently when the secret or the value changes", () => {
    const signature = signHmac("payload", "secret");

    expect(signHmac("payload", "other-secret")).not.toBe(signature);
    expect(signHmac("payload2", "secret")).not.toBe(signature);
  });

  it("should return a base64url signature", () => {
    // 300 signatures of a two-part input cover the characters standard base64 would add.
    for (let i = 0; i < 300; i++) {
      expect(signHmac(`payload-${i}`, "secret")).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("verifyHmac", () => {
  it("should accept the signature of the same value and secret", () => {
    const signature = signHmac("payload", "secret");

    expect(verifyHmac("payload", signature, "secret")).toBe(true);
  });

  it("should reject a signature of another value", () => {
    const signature = signHmac("payload", "secret");

    expect(verifyHmac("another-payload", signature, "secret")).toBe(false);
  });

  it("should reject a signature made with another secret", () => {
    const signature = signHmac("payload", "other-secret");

    expect(verifyHmac("payload", signature, "secret")).toBe(false);
  });

  it("should reject a signature of another length", () => {
    expect(verifyHmac("payload", "short", "secret")).toBe(false);
    expect(verifyHmac("payload", "", "secret")).toBe(false);
  });
});

describe("getBaseUrl", () => {
  it("should return base url with trailing slash", () => {
    const req = {
      hostname: "localhost",
      protocol: "http",
      ip: "127.0.0.1",
      headers: {},
    } as Request;

    expect(getBaseUrl("/prefix", req)).toBe("http://localhost/");
  });

  it("should return base url without trailing slash", () => {
    const req = {
      hostname: "localhost",
      protocol: "http",
      ip: "127.0.0.1",
      headers: {},
    } as Request;

    expect(getBaseUrl("/prefix", req, true)).toBe("http://localhost");
  });
});

describe("getFullUrl", () => {
  it("should preserve url_prefix when req.url does not include it (reverse proxy scenario)", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/-/oauth/callback/authn?code=abc&state=xyz",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix/", req);
    expect(url.toString()).toBe("https://registry.example.com/prefix/-/oauth/callback/authn?code=abc&state=xyz");
  });

  it("should not duplicate url_prefix when req.url already includes it", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/prefix/-/oauth/callback/authn?code=abc&state=xyz",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix/", req);
    expect(url.toString()).toBe("https://registry.example.com/prefix/-/oauth/callback/authn?code=abc&state=xyz");
  });

  it("should work correctly when url_prefix is empty", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/");

    const req = {
      url: "/-/oauth/callback/authn?code=abc&state=xyz",
      headers: {},
    } as Request;

    const url = getFullUrl("", req);
    expect(url.toString()).toBe("https://registry.example.com/-/oauth/callback/authn?code=abc&state=xyz");
  });

  it("should return a URL object with correct parts", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/-/oauth/callback/authn?code=abc&state=xyz",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix/", req);
    expect(url.hostname).toBe("registry.example.com");
    expect(url.pathname).toBe("/prefix/-/oauth/callback/authn");
    expect(url.searchParams.get("code")).toBe("abc");
    expect(url.searchParams.get("state")).toBe("xyz");
  });

  it("should handle url_prefix with trailing slash when req.url lacks it", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/prefix",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix/", req);
    expect(url.toString()).toBe("https://registry.example.com/prefix");
  });

  it("should not treat substring path as matching the url_prefix", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/prefix-other/callback?code=abc",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix", req);
    expect(url.toString()).toBe("https://registry.example.com/prefix/prefix-other/callback?code=abc");
  });

  it("should match url_prefix without trailing slash against req.url with trailing slash", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/prefix/",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix", req);
    expect(url.toString()).toBe("https://registry.example.com/prefix/");
  });

  it("should normalize url_prefix with multiple trailing slashes", () => {
    vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

    const req = {
      url: "/prefix/callback?code=abc",
      headers: {},
    } as Request;

    const url = getFullUrl("/prefix///", req);
    // cleanPrefix becomes "/prefix", reqPath starts with "/prefix/" → uses new URL()
    expect(url.toString()).toBe("https://registry.example.com/prefix/callback?code=abc");
  });
});

describe("getAllConfiguredGroups", () => {
  it("should return empty array for empty packages", () => {
    expect(getAllConfiguredGroups({})).toEqual([]);
  });

  it("should return empty array for undefined packages", () => {
    expect(getAllConfiguredGroups()).toEqual([]);
  });

  it("should extract unique groups from package config", () => {
    const packages = {
      "@scope/*": {
        access: ["group1", "group2"],
        publish: ["group2", "group3"],
        unpublish: ["group1"],
      },
      package: {
        access: ["group3"],
        publish: ["group2"],
      },
    };
    expect(getAllConfiguredGroups(packages)).toEqual(["group1", "group2", "group3"]);
  });

  it("should handle missing permission keys", () => {
    const packages = {
      "@scope/*": {
        access: ["group1"],
      },
      package: {
        publish: ["group2"],
      },
    };
    expect(getAllConfiguredGroups(packages)).toEqual(["group1", "group2"]);
  });

  it("should handle string type permissions", () => {
    const packages = {
      package1: {
        access: "group1",
        publish: "group2",
      },
      package2: {
        access: "group3",
      },
    } as any;
    expect(getAllConfiguredGroups(packages)).toEqual(["group1", "group2", "group3"]);
  });

  it("should handle mixed string and array permissions", () => {
    const packages = {
      package1: {
        access: "group1",
        publish: ["group2", "group3"],
      },
      package2: {
        access: ["group4"],
        publish: "group5",
      },
    } as any;
    expect(getAllConfiguredGroups(packages)).toEqual(["group1", "group2", "group3", "group4", "group5"]);
  });

  it("should filter out empty strings and maintain unique values", () => {
    const packages = {
      package1: {
        access: ["group1", "", "group2"],
        publish: ["group2", "", "group3"],
      },
      package2: {
        access: ["group3", "group1"],
      },
    };
    expect(getAllConfiguredGroups(packages)).toEqual(["group1", "group2", "group3"]);
  });

  it("should handle packages with no permission fields", () => {
    const packages = {
      package1: {
        name: "test",
      },
      package2: {
        access: ["group1"],
      },
    } as any;
    expect(getAllConfiguredGroups(packages)).toEqual(["group1"]);
  });

  it("should handle unpublish permission", () => {
    const packages = {
      package1: {
        unpublish: ["group1", "group2"],
      },
      package2: {
        access: ["group2", "group3"],
        unpublish: "group4",
      },
    } as any;
    expect(getAllConfiguredGroups(packages)).toEqual(["group1", "group2", "group3", "group4"]);
  });

  it("should deduplicate groups across all permission types", () => {
    const packages = {
      package1: {
        access: ["admin", "developer"],
        publish: ["admin", "publisher"],
        unpublish: false,
      },
    };
    expect(getAllConfiguredGroups(packages)).toEqual(["admin", "developer", "publisher"]);
  });

  it("should handle special characters in group names", () => {
    const packages = {
      package1: {
        access: ["@org/team", "group-name", "group_name"],
        publish: ["group.name"],
      },
    };
    expect(getAllConfiguredGroups(packages)).toEqual(["@org/team", "group-name", "group_name", "group.name"]);
  });
});

describe("getAuthenticatedGroups", () => {
  it("should return boolean value directly", () => {
    expect(getAuthenticatedGroups(true)).toBe(true);
    expect(getAuthenticatedGroups(false)).toBe(false);
  });

  it("should convert string to array and filter empty", () => {
    expect(getAuthenticatedGroups("test")).toEqual(["test"]);
    expect(getAuthenticatedGroups("")).toEqual([]);
  });

  it("should filter array and remove empty values", () => {
    expect(getAuthenticatedGroups(["test1", "", "test2"])).toEqual(["test1", "test2"]);
    expect(getAuthenticatedGroups([])).toEqual([]);
  });

  it("should return false for non-array objects", () => {
    expect(getAuthenticatedGroups({})).toBe(false);
    expect(getAuthenticatedGroups({ test: "value" })).toBe(false);
  });

  it("should return false for other types", () => {
    expect(getAuthenticatedGroups(null)).toBe(false);
    expect(getAuthenticatedGroups()).toBe(false);
    expect(getAuthenticatedGroups(42)).toBe(false);
  });
});

describe("getPackageSpec", () => {
  it("should return package name with version when version is present", () => {
    const pkg = { name: "my-package", version: "1.0.0" };
    expect(getPackageSpec(pkg)).toBe("my-package@1.0.0");
  });

  it("should return package name with tag when tag is present", () => {
    const pkg = { name: "my-package", tag: "latest" };
    expect(getPackageSpec(pkg)).toBe("my-package@latest");
  });

  it("should return package name only when neither version nor tag is present", () => {
    const pkg = { name: "my-package" };
    expect(getPackageSpec(pkg)).toBe("my-package");
  });

  it("should prioritize version over tag when both are present", () => {
    const pkg = { name: "my-package", version: "1.0.0", tag: "latest" };
    expect(getPackageSpec(pkg)).toBe("my-package@1.0.0");
  });

  it("should handle scoped packages with version", () => {
    const pkg = { name: "@scope/package", version: "2.0.0" };
    expect(getPackageSpec(pkg)).toBe("@scope/package@2.0.0");
  });

  it("should handle scoped packages with tag", () => {
    const pkg = { name: "@scope/package", tag: "beta" };
    expect(getPackageSpec(pkg)).toBe("@scope/package@beta");
  });

  it("should handle scoped packages without version or tag", () => {
    const pkg = { name: "@scope/package" };
    expect(getPackageSpec(pkg)).toBe("@scope/package");
  });

  it("should handle semver versions", () => {
    const pkg = { name: "my-package", version: "1.2.3-alpha.1" };
    expect(getPackageSpec(pkg)).toBe("my-package@1.2.3-alpha.1");
  });

  it("should handle caret range in version", () => {
    const pkg = { name: "my-package", version: "^1.0.0" };
    expect(getPackageSpec(pkg)).toBe("my-package@^1.0.0");
  });

  it("should handle common tags", () => {
    const tags = ["latest", "next", "beta", "alpha", "canary"];
    for (const tag of tags) {
      const pkg = { name: "my-package", tag };
      expect(getPackageSpec(pkg)).toBe(`my-package@${tag}`);
    }
  });
});
