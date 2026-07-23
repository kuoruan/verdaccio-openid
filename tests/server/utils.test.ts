import { describe, expect, it, vi } from "vitest";

import { importOptional, interopDefault } from "@/server/utils";

describe("importOptional", () => {
  it("should return the module namespace on successful import", async () => {
    vi.doMock("@/server/store/Redis", () => ({
      default: class MockRedisStore {},
      Cluster: class MockCluster {},
    }));

    const { importOptional } = await import("@/server/utils");
    const result = (await importOptional(import("@/server/store/Redis"), "should not throw")) as any;
    expect(result).toBeDefined();
    expect(result.default).toBeDefined();
    expect(result.Cluster).toBeDefined();
  });

  it("should throw a friendly error on ERR_MODULE_NOT_FOUND", async () => {
    await expect(
      // @ts-expect-error module does not exist
      importOptional(import("./this-does-not-exist"), 'Package "foo" is required. Install it: pnpm add foo'),
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
