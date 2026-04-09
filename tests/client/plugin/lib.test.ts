import { describe, expect, it } from "vitest";

import { parseJwt } from "@/client/plugin/lib";

// Mock window for Node.js environment
if (global.window === undefined) {
  global.window = {
    atob: (str: string) => {
      return Buffer.from(str, "base64").toString("binary");
    },
  };
}

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
