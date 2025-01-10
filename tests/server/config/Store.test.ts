import { FileConfigSchema, InMemoryConfigSchema, RedisConfigSchema } from "@/server/config/Store";

describe("InMemoryConfigSchema", () => {
  it("should validate valid config", () => {
    const validConfigs = [
      { ttl: "1h" },
      { ttl: "1d" },
      { ttl: 3_600_000 }, // 1 hour in ms
      { max: 1000 },
      { ttl: "2h", max: 500 },
      {}, // empty config is valid too
    ];

    for (const config of validConfigs) {
      expect(InMemoryConfigSchema.isValidSync(config)).toBeTruthy();
    }
  });

  it("should reject invalid ttl values", () => {
    const invalidConfigs = [
      { ttl: "" },
      { ttl: 500 }, // less than 1 second
      { ttl: true },
      { ttl: {} },
      { ttl: [] },
    ];

    for (const config of invalidConfigs) {
      expect(InMemoryConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });

  it("should reject invalid max values", () => {
    const invalidConfigs = [{ max: 0 }, { max: -1 }, { max: true }, { max: {} }];

    for (const config of invalidConfigs) {
      expect(InMemoryConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });
});

describe("RedisConfigSchema", () => {
  it("should validate valid config", () => {
    const validConfigs = [
      { username: "user", password: "pass" },
      { port: 6379 },
      { nodes: ["localhost:6379"] },
      { nodes: [6379] },
      { nodes: [{ host: "localhost", port: 6379 }] },
      { ttl: "1h" },
      { ttl: 3_600_000 },
      {}, // empty config is valid too
    ];

    for (const config of validConfigs) {
      expect(RedisConfigSchema.isValidSync(config)).toBeTruthy();
    }
  });

  it("should reject invalid port values", () => {
    const invalidConfigs = [{ port: 0 }, { port: -1 }, { port: 65_536 }, { port: true }];

    for (const config of invalidConfigs) {
      expect(RedisConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });

  it("should reject invalid nodes values", () => {
    const invalidConfigs = [{ nodes: [null] }, { nodes: [true] }];

    for (const config of invalidConfigs) {
      expect(RedisConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });

  it("should reject invalid ttl values", () => {
    const invalidConfigs = [{ ttl: "" }, { ttl: 500 }, { ttl: true }, { ttl: {} }, { ttl: [] }];

    for (const config of invalidConfigs) {
      expect(RedisConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });
});

describe("FileConfigSchema", () => {
  it("should validate valid config", () => {
    const validConfigs = [
      { dir: "/tmp/cache" },
      { dir: "./cache", ttl: "1h" },
      { dir: "/data", ttl: 3_600_000 },
      { dir: "cache", expiredInterval: 1000 },
      { dir: "/cache", ttl: "2h", expiredInterval: 5000 },
    ];

    for (const config of validConfigs) {
      expect(FileConfigSchema.isValidSync(config)).toBeTruthy();
    }
  });

  it("should reject configs without dir", () => {
    const invalidConfigs = [{}, { ttl: "1h" }, { expiredInterval: 1000 }];

    for (const config of invalidConfigs) {
      expect(FileConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });

  it("should reject invalid ttl values", () => {
    const invalidConfigs = [
      { dir: "cache", ttl: "" },
      { dir: "cache", ttl: 500 },
      { dir: "cache", ttl: true },
      { dir: "cache", ttl: {} },
      { dir: "cache", ttl: [] },
    ];

    for (const config of invalidConfigs) {
      expect(FileConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });

  it("should reject invalid expiredInterval values", () => {
    const invalidConfigs = [
      { dir: "cache", expiredInterval: 0 },
      { dir: "cache", expiredInterval: -1 },
      { dir: "cache", expiredInterval: true },
      { dir: "cache", expiredInterval: "1h" },
    ];

    for (const config of invalidConfigs) {
      expect(FileConfigSchema.isValidSync(config)).toBeFalsy();
    }
  });
});
