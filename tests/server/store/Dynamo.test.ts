import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DynamoStore from "@/server/store/Dynamo";
import { DEFAULT_STATE_TTL_MS } from "@/server/store/constants";

// Mock the AWS SDK v3 DocumentClient. Every test resets the send()
// implementation per its needs.
const { sendMock, destroyMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  destroyMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(function MockClient(this: unknown) {
    return { destroy: destroyMock };
  }),
}));

// AWS SDK Command classes use `new` — mock them as constructors that
// return tagged plain objects so we can assert what the store sent.
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({
      send: sendMock,
      destroy: destroyMock,
    })),
  },
  PutCommand: vi.fn(function (this: any, input: unknown) {
    this.__type = "Put";
    this.input = input;
  }),
  GetCommand: vi.fn(function (this: any, input: unknown) {
    this.__type = "Get";
    this.input = input;
  }),
  DeleteCommand: vi.fn(function (this: any, input: unknown) {
    this.__type = "Delete";
    this.input = input;
  }),
}));

const baseConfig = { tableName: "test-table", region: "us-east-1" };

beforeEach(() => {
  sendMock.mockReset();
  destroyMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DynamoStore — required config", () => {
  it("throws if tableName is missing", () => {
    expect(() => new DynamoStore({ region: "us-east-1" } as any)).toThrow(/tableName/);
  });

  it("throws if region is missing", () => {
    expect(() => new DynamoStore({ tableName: "x" } as any)).toThrow(/region/);
  });

  it("throws a readable error when the store config block is absent", () => {
    // Without the optional chain this is a TypeError whose message happens to
    // contain "tableName" too, so match the real error and its type.
    expect(() => new DynamoStore(undefined as any)).toThrow("DynamoStore: `tableName` is required");
    expect(() => new DynamoStore(undefined as any)).not.toThrow(TypeError);
  });
});

describe("DynamoStore — read consistency", () => {
  // Strongly consistent reads cost twice the RCUs. Only read-after-write
  // paths need them; cache-style rows tolerate eventual reads.
  const readConsistencyOf = async (fn: (s: DynamoStore) => MaybePromise<unknown>) => {
    sendMock.mockResolvedValue({});
    await fn(new DynamoStore(baseConfig));
    const cmd = sendMock.mock.calls.at(-1)![0];
    expect(cmd.__type).toBe("Get");
    return cmd.input.ConsistentRead;
  };

  it("reads openid state strongly consistently", async () => {
    await expect(readConsistencyOf((s) => s.getOpenIDState("session-abc", "openid"))).resolves.toBe(true);
  });

  it("reads the webauthn session strongly consistently", async () => {
    await expect(readConsistencyOf((s) => s.getWebAuthnSession("key"))).resolves.toBe(true);
  });

  it("reads cached user info eventually consistently", async () => {
    await expect(readConsistencyOf((s) => s.getUserInfo("user", "openid"))).resolves.toBe(false);
  });

  it("reads cached user groups eventually consistently", async () => {
    await expect(readConsistencyOf((s) => s.getUserGroups("user", "openid"))).resolves.toBe(false);
  });
});

describe("DynamoStore — openid state", () => {
  it("setOpenIDState writes pk + sk + nonce + expires", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.setOpenIDState("session-abc", "nonce-xyz", "openid");

    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.__type).toBe("Put");
    expect(cmd.input.TableName).toBe("test-table");
    expect(cmd.input.Item.pk).toBe("OIDC");
    expect(cmd.input.Item.sk).toBe("openid:state:session-abc");
    expect(cmd.input.Item.nonce).toBe("nonce-xyz");
    expect(typeof cmd.input.Item.expires).toBe("number");
    expect(cmd.input.Item.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("getOpenIDState returns nonce when item present", async () => {
    sendMock.mockResolvedValue({
      Item: {
        pk: "OIDC",
        sk: "openid:state:session-abc",
        nonce: "nonce-xyz",
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });
    const store = new DynamoStore(baseConfig);

    await expect(store.getOpenIDState("session-abc", "openid")).resolves.toBe("nonce-xyz");
  });

  it("getOpenIDState returns undefined for expired rows even if DynamoDB hasn't swept them", async () => {
    sendMock.mockResolvedValue({
      Item: {
        pk: "OIDC",
        sk: "openid:state:stale",
        nonce: "old",
        expires: Math.floor(Date.now() / 1000) - 10,
      },
    });
    const store = new DynamoStore(baseConfig);

    await expect(store.getOpenIDState("stale", "openid")).resolves.toBeUndefined();
  });

  it("getOpenIDState returns undefined on AWS error (fail-closed)", async () => {
    sendMock.mockRejectedValue(new Error("simulated network error"));
    const store = new DynamoStore(baseConfig);

    await expect(store.getOpenIDState("session-abc", "openid")).resolves.toBeUndefined();
  });
});

describe("DynamoStore — partition key namespacing", () => {
  it("uses default partition key 'OIDC' when not set", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.setOpenIDState("k", "n", "openid");
    expect(sendMock.mock.calls[0][0].input.Item.pk).toBe("OIDC");
  });

  it("respects custom partitionKey for shared-table deployments", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore({ ...baseConfig, partitionKey: "OIDC-prod" });

    await store.setOpenIDState("k", "n", "openid");
    expect(sendMock.mock.calls[0][0].input.Item.pk).toBe("OIDC-prod");
  });
});

describe("DynamoStore — size enforcement (security)", () => {
  it("rejects oversize openid state key (>1024 bytes)", async () => {
    const store = new DynamoStore(baseConfig);
    const huge = "a".repeat(2048);

    await expect(store.setOpenIDState(huge, "n", "openid")).rejects.toThrow(/exceeds 1024 byte limit/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects oversize webauthn session (>64 KB)", async () => {
    const store = new DynamoStore(baseConfig);
    const huge = "x".repeat(100 * 1024);

    await expect(store.setWebAuthnSession("k", { status: "ready", token: huge })).rejects.toThrow(
      /exceeds 65536 byte limit/,
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects oversize user info payload (>64 KB JSON)", async () => {
    const store = new DynamoStore(baseConfig);
    const huge = { blob: "x".repeat(100 * 1024) };

    await expect(store.setUserInfo("k", huge, "openid")).rejects.toThrow(/exceeds 65536 byte limit/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("DynamoStore — user info + groups", () => {
  it("setUserGroups deletes the row when groups is empty", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.setUserGroups("user", [], "openid");
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].__type).toBe("Delete");
  });

  it("takeLoginResult reports an oversized key as a miss", async () => {
    sendMock.mockReset();
    const store = new DynamoStore(baseConfig);

    await expect(store.takeLoginResult("k".repeat(2000))).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("setUserGroups rejects an oversized key without touching the database", async () => {
    sendMock.mockReset();
    const store = new DynamoStore(baseConfig);
    const validateSpy = vi.spyOn(store as any, "validate");

    expect(() => store.setUserGroups("k".repeat(2000), [], "openid")).toThrow(/byte limit/);
    expect(validateSpy).toHaveBeenCalledWith("userGroups", "k".repeat(2000), [], { providerId: "openid" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("setUserGroups writes the array when non-empty", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.setUserGroups("user", ["g1", "g2"], "openid");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.__type).toBe("Put");
    expect(cmd.input.Item.groups).toEqual(["g1", "g2"]);
  });

  it("getUserInfo unwraps the data field", async () => {
    sendMock.mockResolvedValue({
      Item: {
        pk: "OIDC",
        sk: "openid:userinfo:user",
        data: { email: "x@y.z", sub: "abc" },
        expires: Math.floor(Date.now() / 1000) + 300,
      },
    });
    const store = new DynamoStore(baseConfig);

    await expect(store.getUserInfo("user", "openid")).resolves.toEqual({
      email: "x@y.z",
      sub: "abc",
    });
  });
});

describe("DynamoStore — webauthn takeWebAuthnSession (atomic CAS)", () => {
  it("returns the current value AND does NOT delete when current equals pendingToken", async () => {
    // First call: GET returns the current token equal to pending.
    sendMock.mockResolvedValueOnce({
      Item: {
        pk: "OIDC",
        sk: "webauthn:session1",
        token: "__pending__",
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });
    const store = new DynamoStore(baseConfig);

    const result = await store.takeWebAuthnSession("session1");
    expect(result).toEqual({ status: "pending" });
    // Only the GET call — no DELETE, because current === pending.
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].__type).toBe("Get");
  });

  it("conditionally DELETEs (token = current) on a ready token, returns value on success", async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        pk: "OIDC",
        sk: "webauthn:session1",
        token: "real-T",
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });
    sendMock.mockResolvedValueOnce({});
    const store = new DynamoStore(baseConfig);

    const result = await store.takeWebAuthnSession("session1");
    expect(result).toEqual({ status: "ready", token: "real-T" });
    expect(sendMock).toHaveBeenCalledTimes(2);
    const del = sendMock.mock.calls[1][0];
    expect(del.__type).toBe("Delete");
    expect(del.input.ConditionExpression).toBe("#t = :current");
    expect(del.input.ExpressionAttributeValues[":current"]).toBe("real-T");
  });

  it("returns undefined when no token row exists", async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new DynamoStore(baseConfig);

    await expect(store.takeWebAuthnSession("session1")).resolves.toBeUndefined();
  });

  it("rethrows non-ConditionalCheckFailed errors (matching Redis error propagation)", async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        pk: "OIDC",
        sk: "webauthn:s",
        token: "real-T",
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });
    const err = new Error("InternalServerError");
    err.name = "InternalServerError";
    sendMock.mockRejectedValueOnce(err);

    const store = new DynamoStore(baseConfig);

    await expect(store.takeWebAuthnSession("s")).rejects.toThrow("DynamoStore.takeWebAuthnSession failed");
  });
});

describe("DynamoStore — login result", () => {
  it("stores the value under its own key with the state ttl", async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new DynamoStore(baseConfig);

    await store.setLoginResult("state-1", { username: "dave", uiToken: "ui", npmToken: "npm" });

    const put = sendMock.mock.calls[0][0];

    expect(put.__type).toBe("Put");
    expect(put.input.Item.sk).toBe("openid-login:login:state-1");
    expect(JSON.parse(put.input.Item.value)).toEqual({ username: "dave", uiToken: "ui", npmToken: "npm" });
    expect(put.input.Item.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("deletes and returns in one operation", async () => {
    sendMock.mockResolvedValueOnce({
      Attributes: {
        pk: "OIDC",
        sk: "openid-login:login:state-1",
        value: '{"username":"dave","uiToken":"ui","npmToken":"npm"}',
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });
    const store = new DynamoStore(baseConfig);

    await expect(store.takeLoginResult("state-1")).resolves.toEqual({
      username: "dave",
      uiToken: "ui",
      npmToken: "npm",
    });

    const del = sendMock.mock.calls[0][0];

    expect(del.__type).toBe("Delete");
    expect(del.input.ReturnValues).toBe("ALL_OLD");

    // A second request finds nothing: the delete returned no attributes.
    sendMock.mockResolvedValueOnce({});

    await expect(store.takeLoginResult("state-1")).resolves.toBeUndefined();
    expect(del.input.Key).toEqual({ pk: "OIDC", sk: "openid-login:login:state-1" });
  });

  it("does not hand out an expired row the TTL reaper has not removed yet", async () => {
    sendMock.mockResolvedValueOnce({
      Attributes: {
        value: '{"username":"dave","uiToken":"ui","npmToken":"npm"}',
        expires: Math.floor(Date.now() / 1000) - 5,
      },
    });
    const store = new DynamoStore(baseConfig);

    await expect(store.takeLoginResult("state-1")).resolves.toBeUndefined();
  });

  it("rethrows a failed delete", async () => {
    sendMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "InternalServerError" }));
    const store = new DynamoStore(baseConfig);

    await expect(store.takeLoginResult("state-1")).rejects.toThrow(/takeLoginResult/);
  });

  it.each(["webAuthn", "loginResult"] as const)(
    "forwards a non-undefined take context to the row key (%s)",
    async (kind) => {
      sendMock.mockResolvedValue({});
      const store = new DynamoStore(baseConfig);
      const rowKeySpy = vi.spyOn(store as any, "rowKey");
      const context = { providerId: "probe" };

      await (store as any).take(kind, "k1", context);

      expect(rowKeySpy).toHaveBeenCalledWith(kind, "k1", context);
      expect(rowKeySpy.mock.calls.find(([k]) => k === kind)?.[2]).toBe(context);
    },
  );
});

describe("DynamoStore — delete paths", () => {
  it("deleteOpenIDState sends DeleteCommand", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.deleteOpenIDState("session-abc", "openid");

    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.__type).toBe("Delete");
    expect(cmd.input.Key.pk).toBe("OIDC");
    expect(cmd.input.Key.sk).toBe("openid:state:session-abc");
  });

  it("deleteWebAuthnSession sends DeleteCommand", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.deleteWebAuthnSession("session-abc");

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].__type).toBe("Delete");
  });
});

describe("DynamoStore — error propagation", () => {
  it("put throws DynamoStoreError on AWS failure", async () => {
    sendMock.mockRejectedValue(new Error("simulated put error"));
    const store = new DynamoStore(baseConfig);

    await expect(store.setOpenIDState("k", "n", "openid")).rejects.toThrow("DynamoStore.put failed");
  });
});

describe("DynamoStore — TTL derivation", () => {
  it("rounds a sub-second ttl up instead of expiring its rows on write", async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new DynamoStore({ ...baseConfig, ttl: 500 });

    await store.setOpenIDState("k", "nonce", "p");

    const put = sendMock.mock.calls[0][0];
    const nowSeconds = Math.floor(Date.now() / 1000);

    // One second of life, not zero: the row is readable until the reaper arrives.
    expect(put.input.Item.expires).toBeGreaterThanOrEqual(nowSeconds + 1);
  });

  it("uses DEFAULT_STATE_TTL_MS when opts.ttl is not provided", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.setOpenIDState("k", "n", "openid");

    const cmd = sendMock.mock.calls[0][0];
    const nowSec = Math.floor(Date.now() / 1000);
    const expectedSec = nowSec + Math.ceil(DEFAULT_STATE_TTL_MS / 1000);
    // Allow ±2s slack for test execution time.
    expect(Math.abs(cmd.input.Item.expires - expectedSec)).toBeLessThanOrEqual(2);
  });

  it("uses configured ttl (milliseconds) when provided", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore({ ...baseConfig, ttl: 10_000 });

    await store.setOpenIDState("k", "n", "openid");
    const cmd = sendMock.mock.calls[0][0];
    const nowSec = Math.floor(Date.now() / 1000);
    expect(Math.abs(cmd.input.Item.expires - (nowSec + 10))).toBeLessThanOrEqual(2);
  });
});

describe("DynamoStore — close()", () => {
  it("destroys the underlying client", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);
    await store.setOpenIDState("k", "n", "openid"); // trigger lazy client init
    await store.close();
    expect(destroyMock).toHaveBeenCalledOnce();
  });

  it("does not throw when closed without prior init", async () => {
    const store = new DynamoStore(baseConfig);
    await expect(store.close()).resolves.toBeUndefined();
  });
});
