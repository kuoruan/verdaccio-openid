import { beforeEach, describe, expect, it, vi } from "vitest";

import RedisStore from "@/server/store/Redis";
import { BaseStore } from "@/server/store/Store";

const { redisClient, pipeline, RedisCtor, ClusterCtor } = vi.hoisted(() => {
  const pipeline = {
    del: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    rpush: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redisClient = {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    hset: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    hgetall: vi.fn().mockResolvedValue({}),
    lrange: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue("OK"),
    disconnect: vi.fn(),
    multi: vi.fn().mockReturnValue(pipeline),
  };

  const RedisCtor = vi.fn(function MockRedis(this: unknown) {
    return redisClient;
  });
  const ClusterCtor = vi.fn(function MockRedisCluster(this: unknown) {
    return redisClient;
  });

  (RedisCtor as any).Cluster = ClusterCtor;

  return { redisClient, pipeline, RedisCtor, ClusterCtor };
});

vi.mock("ioredis", () => ({
  Redis: RedisCtor,
  Cluster: ClusterCtor,
}));

describe("RedisStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    redisClient.exists.mockResolvedValue(0);
    redisClient.get.mockResolvedValue(null);
    redisClient.hgetall.mockResolvedValue({});
    redisClient.lrange.mockResolvedValue([]);
    redisClient.quit.mockResolvedValue("OK");
    pipeline.exec.mockResolvedValue([]);
  });

  it("should initialize redis client with default options", () => {
    new RedisStore();

    expect(RedisCtor).toHaveBeenCalledWith({});
    expect(ClusterCtor).not.toHaveBeenCalled();
  });

  it("should initialize redis client with url", () => {
    new RedisStore("redis://localhost:6379");

    expect(RedisCtor).toHaveBeenCalledWith("redis://localhost:6379", {});
    expect(ClusterCtor).not.toHaveBeenCalled();
  });

  it("should initialize redis client with single-node options", () => {
    new RedisStore({ host: "127.0.0.1", port: 6379, ttl: 12_345 });

    expect(RedisCtor).toHaveBeenCalledWith({ host: "127.0.0.1", port: 6379 });
    expect(ClusterCtor).not.toHaveBeenCalled();
  });

  it("should initialize redis cluster with merged redis options", () => {
    new RedisStore({
      nodes: [{ host: "127.0.0.1", port: 7000 }],
      ttl: 12_345,
      username: "user",
      password: "pass",
      redisOptions: { db: 2 },
      scaleReads: "all",
    });

    expect(ClusterCtor).toHaveBeenCalledWith([{ host: "127.0.0.1", port: 7000 }], {
      redisOptions: { username: "user", password: "pass", db: 2 },
      scaleReads: "all",
    });
    expect(RedisCtor).not.toHaveBeenCalled();
  });

  it("should set user info and expiry atomically", async () => {
    const store = new RedisStore();
    const payload = { sub: "alice", email: "alice@example.com" };

    await store.setUserInfo("test-user", payload, "openid");

    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(pipeline.hset).toHaveBeenCalledWith("openid:userinfo:test-user", payload);
    expect(pipeline.pexpire).toHaveBeenCalledWith("openid:userinfo:test-user", BaseStore.DefaultDataTTL);
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it("should return null for missing user info", async () => {
    const store = new RedisStore();

    redisClient.hgetall.mockResolvedValueOnce({});

    await expect(store.getUserInfo("test-user", "openid")).resolves.toBeNull();
    expect(redisClient.exists).not.toHaveBeenCalled();
  });

  it("should return user info when present", async () => {
    const store = new RedisStore();
    const userInfo = { sub: "alice", email: "alice@example.com" };

    redisClient.hgetall.mockResolvedValueOnce(userInfo);

    await expect(store.getUserInfo("test-user", "openid")).resolves.toEqual(userInfo);
    expect(redisClient.exists).not.toHaveBeenCalled();
  });

  it("should overwrite user groups instead of appending", async () => {
    const store = new RedisStore();

    await store.setUserGroups("test-user", ["dev", "ops"], "openid");

    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(pipeline.del).toHaveBeenCalledWith("openid:groups:test-user");
    expect(pipeline.rpush).toHaveBeenCalledWith("openid:groups:test-user", "dev", "ops");
    expect(pipeline.pexpire).toHaveBeenCalledWith("openid:groups:test-user", BaseStore.DefaultDataTTL);
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it("should skip list writes when groups are empty", async () => {
    const store = new RedisStore();

    await store.setUserGroups("test-user", [], "openid");

    expect(pipeline.del).toHaveBeenCalledWith("openid:groups:test-user");
    expect(pipeline.rpush).not.toHaveBeenCalled();
    expect(pipeline.pexpire).not.toHaveBeenCalled();
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it("should return null for missing groups", async () => {
    const store = new RedisStore();

    redisClient.lrange.mockResolvedValueOnce([]);

    await expect(store.getUserGroups("test-user", "openid")).resolves.toBeNull();
    expect(redisClient.exists).not.toHaveBeenCalled();
  });

  it("should return groups when key exists", async () => {
    const store = new RedisStore();

    redisClient.lrange.mockResolvedValueOnce(["dev", "ops"]);

    await expect(store.getUserGroups("test-user", "openid")).resolves.toEqual(["dev", "ops"]);
    expect(redisClient.exists).not.toHaveBeenCalled();
  });

  it("should return null for missing state", async () => {
    const store = new RedisStore();

    redisClient.get.mockResolvedValueOnce(null);

    await expect(store.getOpenIDState("test-state", "openid")).resolves.toBeNull();
    expect(redisClient.exists).not.toHaveBeenCalled();
  });

  it("should return state when present", async () => {
    const store = new RedisStore();

    redisClient.get.mockResolvedValueOnce("nonce-123");

    await expect(store.getOpenIDState("test-state", "openid")).resolves.toBe("nonce-123");
    expect(redisClient.exists).not.toHaveBeenCalled();
  });

  it("should set webauthn token with ttl", async () => {
    const store = new RedisStore();

    await store.setWebAuthnToken("session-id", "token-value");

    expect(redisClient.set).toHaveBeenCalledWith("authn:session-id", "token-value", "PX", BaseStore.DefaultStateTTL);
  });

  it("should disconnect when quit fails", async () => {
    const store = new RedisStore();

    redisClient.quit.mockRejectedValueOnce(new Error("quit failed"));

    await expect(store.close()).resolves.toBeUndefined();
    expect(redisClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
