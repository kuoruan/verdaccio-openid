import type { Request } from "express";

import {
  base64Decode,
  base64Encode,
  getAllConfiguredGroups,
  getAuthenticatedGroups,
  getBaseUrl,
  getClaimsFromIdToken,
  hashObject,
  isNowBefore,
} from "@/server/plugin/utils";

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
    expect(hashObject(obj)).toBe("ecacb99652cdca6195f645dd19454c3e8d9a14ca9a137e62506f72f20db4f09e");
  });
});

describe("getClaimsFromIdToken", () => {
  it("should extract claims from id token", () => {
    const token = "header.eyJ0ZXN0IjoidmFsdWUifQ.signature";
    expect(getClaimsFromIdToken(token)).toEqual({ test: "value" });
  });

  it("should throw on invalid token format", () => {
    expect(() => getClaimsFromIdToken("invalid")).toThrow("Invalid id token");
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

describe("getBaseUrl", () => {
  it("should return base url with trailing slash", () => {
    const req = {
      hostname: "localhost",
      protocol: "http",
      ip: "127.0.0.1",
      headers: {},
    } as Request;

    vi.mock("@verdaccio/url", () => ({
      getPublicUrl: vi.fn().mockReturnValue("http://localhost/"),
    }));

    expect(getBaseUrl("/prefix", req)).toBe("http://localhost/");
  });

  it("should return base url without trailing slash", () => {
    const req = {
      hostname: "localhost",
      protocol: "http",
      ip: "127.0.0.1",
      headers: {},
    } as Request;

    vi.mock("@verdaccio/url", () => ({
      getPublicUrl: vi.fn().mockReturnValue("http://localhost/"),
    }));

    expect(getBaseUrl("/prefix", req, true)).toBe("http://localhost");
  });
});

describe("getAllConfiguredGroups", () => {
  it("should return empty array for empty packages", () => {
    expect(getAllConfiguredGroups({})).toEqual([]);
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
