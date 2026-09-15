import { beforeEach, describe, expect, it, vi } from "vitest";

import MongoStore from "@/server/store/Mongo";
import { BaseStore } from "@/server/store/Store";

// Mock the MongoDB driver. Every test resets the collection method
// implementations per its needs.
const { collection, db, client, MongoClientCtor } = vi.hoisted(() => {
  const collection = {
    createIndex: vi.fn(),
    replaceOne: vi.fn(),
    findOne: vi.fn(),
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
  collection.deleteOne.mockReset().mockResolvedValue({ acknowledged: true, deletedCount: 1 });
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
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(before + BaseStore.DefaultStateTTL);
    expect(replacement.expiresAt.getTime()).toBeLessThanOrEqual(after + BaseStore.DefaultStateTTL);
    expect(options).toEqual({ upsert: true });
  });

  it("honours a custom ttl", async () => {
    const store = new MongoStore({ ...baseConfig, ttl: 5000 });
    const before = Date.now();

    await store.setOpenIDState("s", "n", "p");

    const [, replacement] = collection.replaceOne.mock.calls[0];
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 5000);
    expect(replacement.expiresAt.getTime()).toBeLessThan(before + BaseStore.DefaultStateTTL);
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

    const error = await store.setOpenIDState("s", "very-secret-nonce", "p").catch((e: Error) => e);

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

    await expect(store.setUserInfo("u", "nope", "p")).rejects.toThrow(TypeError);
    await expect(store.setUserInfo("u", null, "p")).rejects.toThrow(TypeError);
  });

  it("setUserInfo / getUserInfo round-trip under the data TTL", async () => {
    const store = new MongoStore(baseConfig);
    const before = Date.now();

    await store.setUserInfo("alice", { email: "alice@example.com" }, "p");

    const [filter, replacement] = collection.replaceOne.mock.calls[0];
    expect(filter).toEqual({ _id: "p:userinfo:alice" });
    expect(replacement.data).toEqual({ email: "alice@example.com" });
    expect(replacement.expiresAt.getTime()).toBeGreaterThanOrEqual(before + BaseStore.DefaultDataTTL);

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

  it("getUserGroups returns the stored groups", async () => {
    collection.findOne.mockResolvedValue({ _id: "p:groups:alice", groups: ["dev"] });

    const store = new MongoStore(baseConfig);

    await expect(store.getUserGroups("alice", "p")).resolves.toEqual(["dev"]);
  });
});

describe("MongoStore — webauthn token", () => {
  const PENDING = "__pending__";

  it("setWebAuthnToken / getWebAuthnToken use the webauthn key", async () => {
    const store = new MongoStore(baseConfig);

    await store.setWebAuthnToken("session-1", PENDING);
    const [filter, replacement] = collection.replaceOne.mock.calls[0];
    expect(filter._id).toMatch(/:session-1$/);
    expect(replacement.token).toBe(PENDING);

    collection.findOne.mockResolvedValue({ _id: filter._id, token: PENDING });
    await expect(store.getWebAuthnToken("session-1")).resolves.toBe(PENDING);
  });

  it("takeWebAuthnToken returns undefined for an unknown session without deleting", async () => {
    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnToken("nope", PENDING)).resolves.toBeUndefined();
    expect(collection.deleteOne).not.toHaveBeenCalled();
  });

  it("takeWebAuthnToken returns a pending token without deleting it", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: PENDING });

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnToken("session-1", PENDING)).resolves.toBe(PENDING);
    expect(collection.deleteOne).not.toHaveBeenCalled();
  });

  it("takeWebAuthnToken consumes a ready token with a conditional delete", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: "npm-token" });

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnToken("session-1", PENDING)).resolves.toBe("npm-token");

    const [filter] = collection.deleteOne.mock.calls[0];
    expect(filter._id).toMatch(/:session-1$/);
    expect(filter.token).toBe("npm-token");
  });

  it("takeWebAuthnToken returns undefined when it loses the race", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: "npm-token" });
    collection.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 0 });

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnToken("session-1", PENDING)).resolves.toBeUndefined();
  });

  it("takeWebAuthnToken throws a MongoStoreError when the delete fails", async () => {
    collection.findOne.mockResolvedValue({ _id: "x", token: "npm-token" });
    collection.deleteOne.mockRejectedValue(Object.assign(new Error("down"), { name: "MongoNetworkError" }));

    const store = new MongoStore(baseConfig);

    await expect(store.takeWebAuthnToken("session-1", PENDING)).rejects.toThrow(
      "MongoStore.takeWebAuthnToken failed: MongoNetworkError",
    );
  });

  it("deleteWebAuthnToken deletes by the webauthn key", async () => {
    const store = new MongoStore(baseConfig);

    await store.deleteWebAuthnToken("session-1");

    const [filter] = collection.deleteOne.mock.calls[0];
    expect(filter._id).toMatch(/:session-1$/);
  });
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
