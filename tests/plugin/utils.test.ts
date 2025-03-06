import type { Request } from "express";

import {
  base64Decode,
  base64Encode,
  getBaseUrl,
  getClaimsFromIdToken,
  hashObject,
  isNowBefore,
} from "@/server/plugin/utils";

describe("base64Encode", () => {
  it("should encode string to base64", () => {
    expect(base64Encode("test")).toBe("dGVzdA");
  });
});

describe("base64Decode", () => {
  it("should decode base64 string", () => {
    expect(base64Decode("dGVzdA")).toBe("test");
  });
});

describe("hashObject", () => {
  it("should return string directly if input is string", () => {
    expect(hashObject("test")).toBe("test");
  });

  it("should hash object to sha256", () => {
    const obj = { test: "value" };
    expect(hashObject(obj)).toMatch(/^[a-f0-9]{64}$/);
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
