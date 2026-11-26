import { describe, expect, it } from "vitest";

import { importOptional, interopDefault } from "@/server/utils";

describe("importOptional", () => {
  it("should return the module namespace on successful import", async () => {
    const module = {
      default: class MockRedisStore {},
      Cluster: class MockCluster {},
    };

    await expect(importOptional(Promise.resolve(module), "should not throw")).resolves.toBe(module);
  });

  it("should throw a friendly error on ERR_MODULE_NOT_FOUND", async () => {
    await expect(
      // @ts-expect-error module does not exist
      importOptional(import("@root/tests/this-does-not-exist"), 'Package "foo" is required. Install it: pnpm add foo'),
    ).rejects.toThrow('Package "foo" is required. Install it: pnpm add foo');
  });
});

describe("interopDefault", () => {
  it("should unwrap default export", async () => {
    const result = await interopDefault({ default: { foo: "bar" } });
    expect(result).toEqual({ foo: "bar" });
  });

  it("should return module as-is when no default", async () => {
    const result = await interopDefault({ foo: "bar" });
    expect(result).toEqual({ foo: "bar" });
  });

  it("should handle promise", async () => {
    const result = await interopDefault(Promise.resolve({ default: { foo: "bar" } }));
    expect(result).toEqual({ foo: "bar" });
  });
});
