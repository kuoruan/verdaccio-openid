import type { Request } from "express";

import { ERRORS } from "@/server/constants";
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
