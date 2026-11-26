import { describe, expect, it } from "vitest";

import { FileConfigSchema, InMemoryConfigSchema, MongoConfigSchema, RedisConfigSchema } from "@/server/config/Store";

describe("InMemoryConfigSchema", () => {
  it.each([
    { ttl: "1h" },
    { ttl: "1d" },
    { ttl: 3_600_000 },
    { max: 1000 },
    { ttl: "2h", max: 500 },
    {},
    ...["1s", "5m", "500ms", 1001].map((ttl) => ({ ttl })),
  ])("accepts %o", (config) => {
    expect(InMemoryConfigSchema.isValidSync(config)).toBe(true);
  });

  it.each([
    { ttl: "" },
    { ttl: 500 },
    { ttl: "5x" },
    { ttl: "0s" },
    { ttl: Number.POSITIVE_INFINITY },
    { ttl: Number.NaN },
    { ttl: true },
    { ttl: {} },
    { ttl: [] },
    { max: 0 },
    { max: -1 },
    { max: true },
    { max: {} },
  ])("rejects %o", (config) => {
    expect(InMemoryConfigSchema.isValidSync(config)).toBe(false);
  });
});

describe("RedisConfigSchema", () => {
  it.each([
    { username: "user", password: "pass" },
    { port: 6379 },
    { nodes: ["localhost:6379"] },
    { nodes: [6379] },
    { nodes: [{ host: "localhost", port: 6379 }] },
    { ttl: "1h" },
    { ttl: 3_600_000 },
    {},
  ])("accepts %o", (config) => {
    expect(RedisConfigSchema.isValidSync(config)).toBe(true);
  });

  it.each([
    { port: 0 },
    { port: -1 },
    { port: 65_536 },
    { port: true },
    { nodes: [null] },
    { nodes: [true] },
    { ttl: "" },
    { ttl: 500 },
    { ttl: true },
    { ttl: {} },
    { ttl: [] },
  ])("rejects %o", (config) => {
    expect(RedisConfigSchema.isValidSync(config)).toBe(false);
  });
});

describe("FileConfigSchema", () => {
  it.each([
    { dir: "/tmp/cache" },
    { dir: "./cache", ttl: "1h" },
    { dir: "/data", ttl: 3_600_000 },
    { dir: "cache", expiredInterval: 1000 },
    { dir: "/cache", ttl: "2h", expiredInterval: 5000 },
  ])("accepts %o", (config) => {
    expect(FileConfigSchema.isValidSync(config)).toBe(true);
  });

  it.each([
    {},
    { ttl: "1h" },
    { expiredInterval: 1000 },
    { dir: "cache", ttl: "" },
    { dir: "cache", ttl: 500 },
    { dir: "cache", ttl: true },
    { dir: "cache", ttl: {} },
    { dir: "cache", ttl: [] },
    { dir: "cache", expiredInterval: 0 },
    { dir: "cache", expiredInterval: -1 },
    { dir: "cache", expiredInterval: true },
    { dir: "cache", expiredInterval: "1h" },
  ])("rejects %o", (config) => {
    expect(FileConfigSchema.isValidSync(config)).toBe(false);
  });
});

describe("MongoConfigSchema", () => {
  it.each([
    { uri: "mongodb://localhost:27017" },
    { uri: "mongodb+srv://user:pw@cluster.example.com/registry", ttl: "1m" },
    { uri: "mongodb://localhost:27017", database: "auth", collection: "oidc" },
    { uri: "MONGO_URI" },
    { uri: "mongodb://localhost:27017", ttl: 3_600_000 },
    {},
  ])("accepts %o", (config) => {
    expect(MongoConfigSchema.isValidSync(config)).toBe(true);
  });

  it.each([
    { uri: "mongodb://localhost:27017", ttl: "" },
    { uri: "mongodb://localhost:27017", ttl: 500 },
    { uri: "mongodb://localhost:27017", ttl: true },
    { uri: "mongodb://localhost:27017", ttl: {} },
    { uri: "mongodb://localhost:27017", ttl: [] },
  ])("rejects %o", (config) => {
    expect(MongoConfigSchema.isValidSync(config)).toBe(false);
  });
});
