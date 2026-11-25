import { beforeEach, describe, expect, it, vi } from "vitest";

import MongoStore from "@/server/store/Mongo";
import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS } from "@/server/store/constants";

// Mock the MongoDB driver. Every test resets the collection method
// implementations per its needs.
const { collection, db, client, MongoClientCtor } = vi.hoisted(() => {
  const collection = {
    createIndex: vi.fn(),
    replaceOne: vi.fn(),
    findOne: vi.fn(),
    findOneAndDelete: vi.fn(),
    deleteOne: vi.fn(),
  };

  const db = {
    collection: vi.fn(() => collection),
  };

  const client = {
    connect: vi.fn(),
    db: vi.fn(() => db),
    close: vi.fn(),
  };

  const MongoClientCtor = vi.fn(function MockMongoClient(this: unknown) {
    return client;
  });

  return { collection, db, client, MongoClientCtor };
});

vi.mock("mongodb", () => ({
  MongoClient: MongoClientCtor,
}));

const URI = "mongodb://localhost:27017";
const baseConfig = { uri: URI };

function resetMocks() {
  MongoClientCtor.mockClear();
  db.collection.mockClear();

  client.connect.mockReset().mockResolvedValue(undefined);
  client.db.mockClear();
  client.close.mockReset().mockResolvedValue(undefined);

  collection.createIndex.mockReset().mockResolvedValue("expiresAt_ttl");
  collection.replaceOne.mockReset().mockResolvedValue({ acknowledged: true, upsertedCount: 1 });
  collection.findOne.mockReset().mockResolvedValue(null);
  collection.findOneAndDelete.mockReset().mockResolvedValue(null);
  collection.deleteOne.mockReset().mockResolvedValue({ acknowledged: true, deletedCount: 1 });
  vi.restoreAllMocks();
}

beforeEach(() => {
  resetMocks();
});

describe("MongoStore — required config", () => {
  it("throws if uri is missing", () => {
    expect(() => new MongoStore({} as any)).toThrow(/uri/);
  });
});

describe("MongoStore — connection", () => {
  it("connects lazily, once, and creates the TTL index", async () => {
    const store = new MongoStore(baseConfig);

    expect(MongoClientCtor).not.toHaveBeenCalled();

    await store.setOpenIDState("k1", "n1", "p");
    await store.getOpenIDState("k1", "p");

    expect(MongoClientCtor).toHaveBeenCalledTimes(1);
    expect(MongoClientCtor).toHaveBeenCalledWith(URI);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { name: "expiresAt_ttl", expireAfterSeconds: 0 },
    );
  });

  it("uses the configured database and collection names", async () => {
    const store = new MongoStore({ uri: URI, database: "auth", collection: "oidc" });

    await store.getOpenIDState("k", "p");

    expect(client.db).toHaveBeenCalledWith("auth");
    expect(db.collection).toHaveBeenCalledWith("oidc");
  });

  it("falls back to the database in the connection string", async () => {
    const store = new MongoStore({ uri: "mongodb+srv://user:pw@cluster.example.com/registry?retryWrites=true" });

    await store.getOpenIDState("k", "p");

    expect(client.db).toHaveBeenCalledWith("registry");
    expect(db.collection).toHaveBeenCalledWith("openid-store");
  });

  it("falls back to the default database when the connection string has none", async () => {
    const store = new MongoStore({ uri: "mongodb://h1:27017,h2:27017/?replicaSet=rs0" });

    await store.getOpenIDState("k", "p");

    expect(client.db).toHaveBeenCalledWith("verdaccio-openid");
  });

  it("keeps working when the TTL index cannot be created", async () => {
    collection.createIndex.mockRejectedValue(Object.assign(new Error("unauthorized"), { code: 13 }));

    const store = new MongoStore(baseConfig);

    await expect(store.setOpenIDState("k1", "n1", "p")).resolves.toBeUndefined();
    expect(collection.replaceOne).toHaveBeenCalledTimes(1);
  });

  it("closes the client and retries the connection after a failed connect", async () => {
    client.connect.mockRejectedValueOnce(Object.assign(new Error("refused"), { name: "MongoServerSelectionError" }));

    const store = new MongoStore(baseConfig);

    await expect(store.setOpenIDState("k1", "n1", "p")).rejects.toThrow(/MongoStore.put failed/);
    expect(client.close).toHaveBeenCalledTimes(1);

    await expect(store.setOpenIDState("k1", "n1", "p")).resolves.toBeUndefined();
    expect(MongoClientCtor).toHaveBeenCalledTimes(2);
  });
});

describe("MongoStore — openid state", () => {
  it("setOpenIDState upserts nonce + expiresAt under the state key", async () => {
    const store = new MongoStore(baseConfig);
    const before = Date.now();

    await store.setOpenIDState("state-1", "nonce-1", "provider");

    const after = Date.now();

    expect(collection.replaceOne).toHaveBeenCalledTimes(1);
    const [filter, replacement, options] = collection.replaceOne.mock.calls[0];

    expect(filter).toEqual({ _id: "provider:state:state-1" });
    expect(replacement.nonce).toBe("nonce-1");
    expect(replacement).not.toHaveProperty("_id");
    expect(replacement.expiresAt).toBeInstanceOf(Date);
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(before + DEFAULT_STATE_TTL_MS);
    expect(replacement.expiresAt.getTime()).toBeLessThanOrEqual(after + DEFAULT_STATE_TTL_MS);
    expect(options).toEqual({ upsert: true });
  });

  it("honours a custom ttl", async () => {
    const store = new MongoStore({ ...baseConfig, ttl: 5000 });
    const before = Date.now();

    await store.setOpenIDState("s", "n", "p");

    const [, replacement] = collection.replaceOne.mock.calls[0];
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 5000);
    expect(replacement.expiresAt.getTime()).toBeLessThan(before + DEFAULT_STATE_TTL_MS);
  });

  it("getOpenIDState filters on the key and a non-expired expiresAt", async () => {
    collection.findOne.mockResolvedValue({ _id: "p:state:s", nonce: "n", expiresAt: new Date(Date.now() + 1000) });

    const store = new MongoStore(baseConfig);
    const nonce = await store.getOpenIDState("s", "p");

    expect(nonce).toBe("n");
    const [filter] = collection.findOne.mock.calls[0];
    expect(filter._id).toBe("p:state:s");
    expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
  });

  it("getOpenIDState returns undefined when nothing matches", async () => {
    const store = new MongoStore(baseConfig);

    await expect(store.getOpenIDState("missing", "p")).resolves.toBeUndefined();
  });

  it("getOpenIDState fails closed on a driver error", async () => {
    collection.findOne.mockRejectedValue(Object.assign(new Error("timeout"), { name: "MongoNetworkTimeoutError" }));

    const store = new MongoStore(baseConfig);

    await expect(store.getOpenIDState("s", "p")).resolves.toBeUndefined();
  });

  it("deleteOpenIDState deletes by key and swallows errors", async () => {
    const store = new MongoStore(baseConfig);

    await store.deleteOpenIDState("s", "p");
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: "p:state:s" });

    collection.deleteOne.mockRejectedValue(new Error("boom"));
    await expect(store.deleteOpenIDState("s", "p")).resolves.toBeUndefined();
  });

  it("setOpenIDState wraps write failures without leaking the payload", async () => {
    collection.replaceOne.mockRejectedValue(Object.assign(new Error("secret-nonce-in-message"), { code: 8000 }));

    const store = new MongoStore(baseConfig);

    const error = await Promise.resolve(store.setOpenIDState("s", "very-secret-nonce", "p")).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("MongoStoreError");
    expect((error as Error).message).toBe("MongoStore.put failed: 8000");
    expect((error as Error).message).not.toContain("very-secret-nonce");
  });

  it("rejects oversized keys and values before touching the database", async () => {
    const store = new MongoStore(baseConfig);

    await expect(store.setOpenIDState("k".repeat(2000), "n", "p")).rejects.toThrow(/byte limit/);
    await expect(store.setOpenIDState("k", "n".repeat(70 * 1024), "p")).rejects.toThrow(/byte limit/);
    expect(collection.replaceOne).not.toHaveBeenCalled();
  });
});

describe("MongoStore — user info and groups", () => {
  it("setUserInfo rejects non-object data", async () => {
    const store = new MongoStore(baseConfig);

    expect(() => store.setUserInfo("u", "nope", "p")).toThrow(TypeError);
    expect(() => store.setUserInfo("u", null, "p")).toThrow(TypeError);
  });

  it("setUserInfo / getUserInfo round-trip under the data TTL", async () => {
    const store = new MongoStore(baseConfig);
    const before = Date.now();

    await store.setUserInfo("alice", { email: "alice@example.com" }, "p");

    const [filter, replacement] = collection.replaceOne.mock.calls[0];
    expect(filter).toEqual({ _id: "p:userinfo:alice" });
    expect(replacement.data).toEqual({ email: "alice@example.com" });
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(before + DEFAULT_DATA_TTL_MS);

    collection.findOne.mockResolvedValue({ _id: "p:userinfo:alice", data: { email: "alice@example.com" } });
    await expect(store.getUserInfo("alice", "p")).resolves.toEqual({ email: "alice@example.com" });
  });

  it("setUserGroups stores groups, and deletes the document for an empty list", async () => {
    const store = new MongoStore(baseConfig);

    await store.setUserGroups("alice", ["dev", "ops"], "p");
    const [filter, replacement] = collection.replaceOne.mock.calls[0];
    expect(filter).toEqual({ _id: "p:groups:alice" });
    expect(replacement.groups).toEqual(["dev", "ops"]);

    await store.setUserGroups("alice", [], "p");
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: "p:groups:alice" });
    expect(collection.replaceOne).toHaveBeenCalledTimes(1);
  });

  it("takeLoginResult reports an oversized key as a miss", async () => {
    const store = new MongoStore(baseConfig);

    await expect(store.takeLoginResult("k".repeat(2000))).resolves.toBeUndefined();
    expect(collection.findOneAndDelete).not.toHaveBeenCalled();
  });

  it("setUserGroups rejects an oversized key without touching the database", async () => {
    const store = new MongoStore(baseConfig);
    const validateSpy = vi.spyOn(store as any, "validate");

    expect(() => store.setUserGroups("k".repeat(2000), [], "p")).toThrow(/byte limit/);
    expect(validateSpy).toHaveBeenCalledWith("userGroups", "k".repeat(2000), [], { providerId: "p" });
    expect(collection.deleteOne).not.toHaveBeenCalled();
    expect(collection.replaceOne).not.toHaveBeenCalled();
  });

  it("getUserGroups returns the stored groups", async () => {
    collection.findOne.mockResolvedValue({ _id: "p:groups:alice", groups: ["dev"] });

    const store = new MongoStore(baseConfig);

    await expect(store.getUserGroups("alice", "p")).resolves.toEqual(["dev"]);
  });
});

describe("MongoStore — webauthn session", () => {
  const PENDING = "__pending__";

  it("setWebAuthnSession / getWebAuthnSession use the webauthn key", async () => {
    const store = new MongoStore(baseConfig);

    await store.setWebAuthnSession("session-1", { status: "pending" });
    const [filter, replacement] = collection.replaceOne.mock.calls[0];
    expect(filter._id).toMatch(/:session-1$/);
    expect(replacement.token).toBe(PENDING);

    collection.findOne.mockResolvedValue({ _id: filter._id, token: PENDING });
    await expect(store.getWebAuthnSession("session-1")).resolves.toEqual({ status: "pending" });
  });

  it("takeWebAuthnSession returns undefined for an unknown session without deleting", async () => {
    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnSession("nope")).resolves.toBeUndefined();
    expect(collection.deleteOne).not.toHaveBeenCalled();
  });

  it("takeWebAuthnSession returns a pending token without deleting it", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: PENDING });

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnSession("session-1")).resolves.toEqual({ status: "pending" });
    expect(collection.deleteOne).not.toHaveBeenCalled();
  });

  it("takeWebAuthnSession consumes a ready token with a conditional delete", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: "npm-token" });

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnSession("session-1")).resolves.toEqual({ status: "ready", token: "npm-token" });

    const [filter] = collection.deleteOne.mock.calls[0];
    expect(filter._id).toMatch(/:session-1$/);
    expect(filter.token).toBe("npm-token");
  });

  it("takeWebAuthnSession returns undefined when it loses the race", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: "npm-token" });
    collection.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 0 });

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnSession("session-1")).resolves.toBeUndefined();
  });

  it("takeWebAuthnSession throws a MongoStoreError when the delete fails", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: "npm-token" });
    collection.deleteOne.mockRejectedValue(Object.assign(new Error("down"), { name: "MongoNetworkError" }));

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnSession("session-1")).rejects.toThrow(
      "MongoStore.takeWebAuthnSession failed: MongoNetworkError",
    );
  });

  it("deleteWebAuthnSession deletes by the webauthn key", async () => {
    const store = new MongoStore(baseConfig);

    await store.deleteWebAuthnSession("session-1");

    const [filter] = collection.deleteOne.mock.calls[0];
    expect(filter._id).toMatch(/:session-1$/);
  });

  it.each(["webAuthn", "loginResult"] as const)(
    "forwards a non-undefined take context to the row key (%s)",
    async (kind) => {
      const store = new MongoStore(baseConfig);
      const rowKeySpy = vi.spyOn(store as any, "rowKey");
      const context = { providerId: "probe" };

      await (store as any).take(kind, "k1", context);

      expect(rowKeySpy).toHaveBeenCalledWith(kind, "k1", context);
      expect(rowKeySpy.mock.calls.find(([k]) => k === kind)?.[2]).toBe(context);
    },
  );
});

describe("MongoStore — close", () => {
  it("is a no-op before the first connection", async () => {
    const store = new MongoStore(baseConfig);

    await expect(store.close()).resolves.toBeUndefined();
    expect(client.close).not.toHaveBeenCalled();
  });

  it("closes the client and reconnects on the next operation", async () => {
    const store = new MongoStore(baseConfig);

    await store.getOpenIDState("k", "p");
    await store.close();

    expect(client.close).toHaveBeenCalledTimes(1);

    await store.getOpenIDState("k", "p");
    expect(MongoClientCtor).toHaveBeenCalledTimes(2);
  });

  it("does not throw when initialization had failed", async () => {
    client.connect.mockRejectedValue(new Error("refused"));

    const store = new MongoStore(baseConfig);

    await store.getOpenIDState("k", "p");
    await expect(store.close()).resolves.toBeUndefined();
  });
});

describe("MongoStore — login result", () => {
  it("stores the value under its own key with the state ttl", async () => {
    const store = new MongoStore(baseConfig);

    await store.setLoginResult("state-1", { username: "dave", uiToken: "ui", npmToken: "npm" });

    const [filter, doc] = collection.replaceOne.mock.calls[0] as [any, any];

    expect(filter).toEqual({ _id: "openid-login:login:state-1" });
    expect(JSON.parse(doc.value)).toEqual({ username: "dave", uiToken: "ui", npmToken: "npm" });
    expect(doc.expiresAt).toBeInstanceOf(Date);
  });

  it("reads and deletes in one operation, so a second request finds nothing", async () => {
    const store = new MongoStore(baseConfig);

    collection.findOneAndDelete.mockResolvedValueOnce({
      _id: "openid-login:login:state-1",
      value: '{"username":"dave","uiToken":"ui","npmToken":"npm"}',
    });

    await expect(store.takeLoginResult("state-1")).resolves.toEqual({
      username: "dave",
      uiToken: "ui",
      npmToken: "npm",
    });

    const filter = collection.findOneAndDelete.mock.calls[0][0] as any;

    expect(filter._id).toBe("openid-login:login:state-1");
    // An expired document is never handed out.
    expect(filter.expiresAt.$gt).toBeInstanceOf(Date);

    // The next request matches nothing: the document is gone.
    await expect(store.takeLoginResult("state-1")).resolves.toBeUndefined();
  });

  it("rethrows when the delete fails", async () => {
    const store = new MongoStore(baseConfig);

    collection.findOneAndDelete.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "ECONNRESET" }));

    await expect(store.takeLoginResult("state-1")).rejects.toThrow(/takeLoginResult/);
  });
});
