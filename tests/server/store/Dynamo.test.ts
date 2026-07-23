import { beforeEach, describe, expect, it, vi } from "vitest";

import DynamoStore from "@/server/store/Dynamo";
import { BaseStore } from "@/server/store/Store";

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

describe("DynamoStore — required config", () => {
  it("throws if tableName is missing", () => {
    expect(() => new DynamoStore({ region: "us-east-1" } as any)).toThrow(/tableName/);
  });

  it("throws if region is missing", () => {
    expect(() => new DynamoStore({ tableName: "x" } as any)).toThrow(/region/);
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

  it("rejects oversize webauthn token (>64 KB)", async () => {
    const store = new DynamoStore(baseConfig);
    const huge = "x".repeat(100 * 1024);

    await expect(store.setWebAuthnToken("k", huge)).rejects.toThrow(/exceeds 65536 byte limit/);
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

describe("DynamoStore — webauthn takeWebAuthnToken (atomic CAS)", () => {
  it("returns the current value AND does NOT delete when current equals pendingToken", async () => {
    // First call: GET returns the current token equal to pending.
    sendMock.mockResolvedValueOnce({
      Item: {
        pk: "OIDC",
        sk: "webauthn:session1",
        token: "pending-T",
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });
    const store = new DynamoStore(baseConfig);

    const result = await store.takeWebAuthnToken("session1", "pending-T");
    expect(result).toBe("pending-T");
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

    const result = await store.takeWebAuthnToken("session1", "pending-T");
    expect(result).toBe("real-T");
    expect(sendMock).toHaveBeenCalledTimes(2);
    const del = sendMock.mock.calls[1][0];
    expect(del.__type).toBe("Delete");
    expect(del.input.ConditionExpression).toBe("#t = :current");
    expect(del.input.ExpressionAttributeValues[":current"]).toBe("real-T");
  });

  it("returns undefined when no token row exists", async () => {
    sendMock.mockResolvedValueOnce({});
    const store = new DynamoStore(baseConfig);

    await expect(store.takeWebAuthnToken("session1", "pending-T")).resolves.toBeUndefined();
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

    await expect(store.takeWebAuthnToken("s", "pending-T")).rejects.toThrow("DynamoStore.takeWebAuthnToken failed");
  });
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

  it("deleteWebAuthnToken sends DeleteCommand", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.deleteWebAuthnToken("session-abc");

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
  it("uses BaseStore.DefaultStateTTL when opts.ttl is not provided", async () => {
    sendMock.mockResolvedValue({});
    const store = new DynamoStore(baseConfig);

    await store.setOpenIDState("k", "n", "openid");

    const cmd = sendMock.mock.calls[0][0];
    const nowSec = Math.floor(Date.now() / 1000);
    const expectedSec = nowSec + Math.floor(BaseStore.DefaultStateTTL / 1000);
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
