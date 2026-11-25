import { beforeEach, describe, expect, it, vi } from "vitest";

import RedisStore from "@/server/store/Redis";
import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS } from "@/server/store/constants";

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
    eval: vi.fn().mockResolvedValue(false),
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
    redisClient.eval.mockResolvedValue(false);
    redisClient.quit.mockResolvedValue("OK");
    pipeline.exec.mockResolvedValue([]);
  });

  it("should initialize redis client with default options", async () => {
    const store = new RedisStore();
    await store.setOpenIDState("key", "nonce", "provider");

    expect(RedisCtor).toHaveBeenCalledWith();
    expect(ClusterCtor).not.toHaveBeenCalled();
  });

  it("should initialize redis client with url", async () => {
    const store = new RedisStore("redis://localhost:6379");
    await store.setOpenIDState("key", "nonce", "provider");

    expect(RedisCtor).toHaveBeenCalledWith("redis://localhost:6379");
    expect(ClusterCtor).not.toHaveBeenCalled();
  });

  it("should initialize redis client with single-node options", async () => {
    const store = new RedisStore({ host: "127.0.0.1", port: 6379, ttl: 12_345 });
    await store.setOpenIDState("key", "nonce", "provider");

    expect(RedisCtor).toHaveBeenCalledWith({ host: "127.0.0.1", port: 6379 });
    expect(ClusterCtor).not.toHaveBeenCalled();
  });

  it("should initialize redis cluster with merged redis options", async () => {
    const store = new RedisStore({
      nodes: [{ host: "127.0.0.1", port: 7000 }],
      ttl: 12_345,
      username: "user",
      password: "pass",
      redisOptions: { db: 2 },
      scaleReads: "all",
    });
    await store.setOpenIDState("key", "nonce", "provider");

    expect(ClusterCtor).toHaveBeenCalledWith([{ host: "127.0.0.1", port: 7000 }], {
      redisOptions: { username: "user", password: "pass", db: 2 },
      scaleReads: "all",
    });
    expect(RedisCtor).not.toHaveBeenCalled();
  });

  it("should store user info as JSON with its expiry", async () => {
    const store = new RedisStore();
    const payload = { sub: "alice", groups: ["dev", "ops"], meta: { team: "a" } };

    await store.setUserInfo("test-user", payload, "openid");

    expect(redisClient.set).toHaveBeenCalledWith(
      "openid:userinfo:test-user",
      JSON.stringify(payload),
      "PX",
      DEFAULT_DATA_TTL_MS,
    );
    expect(pipeline.hset).not.toHaveBeenCalled();
  });

  it("should return undefined for missing user info", async () => {
    const store = new RedisStore();

    redisClient.get.mockResolvedValueOnce(null);

    await expect(store.getUserInfo("test-user", "openid")).resolves.toBeUndefined();
  });

  it("should return user info with the shape it was stored with", async () => {
    const store = new RedisStore();
    const userInfo = { sub: "alice", groups: ["dev", "ops"], meta: { team: "a" } };

    redisClient.get.mockResolvedValueOnce(JSON.stringify(userInfo));

    await expect(store.getUserInfo("test-user", "openid")).resolves.toEqual(userInfo);
  });

  it("should treat an unreadable value as a miss", async () => {
    const store = new RedisStore();

    redisClient.get.mockResolvedValueOnce("not json");

    await expect(store.getUserInfo("test-user", "openid")).resolves.toBeUndefined();
  });

  it("should treat a hash left by an earlier version as a miss and drop it", async () => {
    const store = new RedisStore();

    redisClient.get.mockRejectedValueOnce(
      new Error("WRONGTYPE Operation against a key holding the wrong kind of value"),
    );

    await expect(store.getUserInfo("test-user", "openid")).resolves.toBeUndefined();
    expect(redisClient.del).toHaveBeenCalledWith("openid:userinfo:test-user");
  });

  it("should not swallow an unrelated redis error", async () => {
    const store = new RedisStore();

    redisClient.get.mockRejectedValueOnce(new Error("Connection is closed."));

    await expect(store.getUserInfo("test-user", "openid")).rejects.toThrow("Connection is closed.");
  });

  it("should overwrite user groups instead of appending", async () => {
    const store = new RedisStore();

    await store.setUserGroups("test-user", ["dev", "ops"], "openid");

    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(pipeline.del).toHaveBeenCalledWith("openid:groups:test-user");
    expect(pipeline.rpush).toHaveBeenCalledWith("openid:groups:test-user", "dev", "ops");
    expect(pipeline.pexpire).toHaveBeenCalledWith("openid:groups:test-user", DEFAULT_DATA_TTL_MS);
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it("should skip list writes when groups are empty", async () => {
    const store = new RedisStore();

    await store.setUserGroups("test-user", [], "openid");

    expect(redisClient.del).toHaveBeenCalledWith("openid:groups:test-user");
    expect(redisClient.multi).not.toHaveBeenCalled();
  });

  it("should return undefined for missing groups", async () => {
    const store = new RedisStore();

    redisClient.lrange.mockResolvedValueOnce([]);

    await expect(store.getUserGroups("test-user", "openid")).resolves.toBeUndefined();
  });

  it("should return groups when key exists", async () => {
    const store = new RedisStore();

    redisClient.lrange.mockResolvedValueOnce(["dev", "ops"]);

    await expect(store.getUserGroups("test-user", "openid")).resolves.toEqual(["dev", "ops"]);
  });

  it("should return undefined for missing state", async () => {
    const store = new RedisStore();

    redisClient.get.mockResolvedValueOnce(null);

    await expect(store.getOpenIDState("test-state", "openid")).resolves.toBeUndefined();
  });

  it("should return state when present", async () => {
    const store = new RedisStore();

    redisClient.get.mockResolvedValueOnce("nonce-123");

    await expect(store.getOpenIDState("test-state", "openid")).resolves.toBe("nonce-123");
  });

  it("should set webauthn session with ttl", async () => {
    const store = new RedisStore();

    await store.setWebAuthnSession("session-id", { status: "ready", token: "token-value" });

    expect(redisClient.set).toHaveBeenCalledWith("authn:session-id", "token-value", "PX", DEFAULT_STATE_TTL_MS);
  });

  it("should take ready webauthn session atomically", async () => {
    const store = new RedisStore();

    redisClient.eval.mockResolvedValueOnce("issued-token");

    await expect(store.takeWebAuthnSession("session-id")).resolves.toEqual({ status: "ready", token: "issued-token" });

    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), 1, "authn:session-id", "__pending__");
  });

  it("should keep a pending webauthn session while taking", async () => {
    const store = new RedisStore();

    redisClient.eval.mockResolvedValueOnce("__pending__");

    await expect(store.takeWebAuthnSession("session-id")).resolves.toEqual({ status: "pending" });
  });

  it("should return undefined when the webauthn session is missing", async () => {
    const store = new RedisStore();

    redisClient.eval.mockResolvedValueOnce(false);

    await expect(store.takeWebAuthnSession("session-id")).resolves.toBeUndefined();
  });

  it("should store a login result under its own key with the state ttl", async () => {
    const store = new RedisStore({ ttl: 30_000 });

    await store.setLoginResult("state-1", { username: "dave", uiToken: "ui", npmToken: "npm" });

    expect(redisClient.set).toHaveBeenCalledWith(
      "openid-login:login:state-1",
      '{"username":"dave","uiToken":"ui","npmToken":"npm"}',
      "PX",
      30_000,
    );
  });

  it("should take a login result with the script that reads and deletes at once", async () => {
    const store = new RedisStore();

    redisClient.eval.mockResolvedValueOnce('{"username":"dave","uiToken":"ui","npmToken":"npm"}');

    await expect(store.takeLoginResult("state-1")).resolves.toEqual({
      username: "dave",
      uiToken: "ui",
      npmToken: "npm",
    });

    expect(redisClient.eval).toHaveBeenCalledTimes(1);
    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), 1, "openid-login:login:state-1");
    const [script] = redisClient.eval.mock.calls[0] as [string];
    // The delete is part of the script, so a second reader finds nothing.
    expect(script).toContain('redis.call("DEL", KEYS[1])');
    // The login script takes no ARGV: a PENDING_TOKEN here would mean the
    // webAuthn script was dispatched by mistake.
    expect(script).not.toContain("ARGV");
  });

  it.each(["webAuthn", "loginResult"] as const)(
    "forwards a non-undefined take context to the row key (%s)",
    async (kind) => {
      const store = new RedisStore();
      const rowKeySpy = vi.spyOn(store as any, "rowKey");
      const context = { providerId: "probe" };

      redisClient.eval.mockResolvedValueOnce(false);
      await (store as any).take(kind, "k1", context);

      expect(rowKeySpy).toHaveBeenCalledWith(kind, "k1", context);
      expect(rowKeySpy.mock.calls.find(([k]) => k === kind)?.[2]).toBe(context);
    },
  );

  it("should report a missing login result as undefined", async () => {
    const store = new RedisStore();

    redisClient.eval.mockResolvedValueOnce(false);

    await expect(store.takeLoginResult("state-1")).resolves.toBeUndefined();
  });

  it("should report a corrupted login result as a miss", async () => {
    const store = new RedisStore();

    for (const raw of ["not-json", '{"username":"dave"}']) {
      redisClient.eval.mockResolvedValueOnce(raw);

      await expect(store.takeLoginResult("state-1")).resolves.toBeUndefined();
    }
  });

  it("should disconnect when quit fails", async () => {
    const store = new RedisStore();
    await store.setOpenIDState("key", "nonce", "provider"); // trigger client init

    redisClient.quit.mockRejectedValueOnce(new Error("quit failed"));

    await expect(store.close()).resolves.toBeUndefined();
    expect(redisClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
