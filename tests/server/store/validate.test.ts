import { afterEach, describe, expect, it, vi } from "vitest";

import DynamoStore from "@/server/store/Dynamo";
import InMemoryStore from "@/server/store/InMemory";
import MongoStore from "@/server/store/Mongo";

class RejectingStore extends InMemoryStore {
  protected override validate(): void {
    throw new Error("too big");
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Evidence for the shared validation entry in BaseStore: every public
 * domain method funnels through `validate(kind, key, value, context)`
 * before touching the backend, with the encoded storage input.
 */
describe("BaseStore shared validation entry", () => {
  it("passes the converted value and full context to validate on writes", async () => {
    const store = new InMemoryStore();
    const validateSpy = vi.spyOn(store as any, "validate");

    await store.setOpenIDState("s", "n", "p");
    expect(validateSpy).toHaveBeenCalledWith("state", "s", "n", { providerId: "p" });

    await store.setWebAuthnSession("w", { status: "pending" });
    expect(validateSpy).toHaveBeenCalledWith("webAuthn", "w", "__pending__", undefined);

    await store.setWebAuthnSession("w2", { status: "ready", token: "t" });
    expect(validateSpy).toHaveBeenCalledWith("webAuthn", "w2", "t", undefined);

    const result = { username: "u", uiToken: "ui", npmToken: "npm" };
    await store.setLoginResult("c", result);
    expect(validateSpy).toHaveBeenCalledWith(
      "loginResult",
      "c",
      '{"username":"u","uiToken":"ui","npmToken":"npm"}',
      undefined,
    );
  });

  it("reports oversized keys as a miss on reads without touching the backend", async () => {
    const store = new RejectingStore();
    const readSpy = vi.spyOn(store as any, "read");
    const removeSpy = vi.spyOn(store as any, "remove");
    const takeSpy = vi.spyOn(store as any, "take");

    await expect(store.getOpenIDState("k", "p")).resolves.toBeUndefined();
    await expect(store.getUserInfo("k", "p")).resolves.toBeUndefined();
    await expect(store.getUserGroups("k", "p")).resolves.toBeUndefined();
    await expect(store.getWebAuthnSession("k")).resolves.toBeUndefined();
    await expect(store.takeLoginResult("k")).resolves.toBeUndefined();
    expect(readSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(takeSpy).not.toHaveBeenCalled();
  });

  it("rejects ordinary write validation failures without touching the backend", async () => {
    const store = new RejectingStore();
    const writeSpy = vi.spyOn(store as any, "write");

    await expect(store.setOpenIDState("k", "n", "p")).rejects.toThrow("too big");
    await expect(store.setUserGroups("k", ["g"], "p")).rejects.toThrow("too big");
    await expect(store.setLoginResult("k", { username: "u", uiToken: "ui", npmToken: "npm" })).rejects.toThrow(
      "too big",
    );
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("keeps empty-group removal and non-object userinfo synchronously throwing", () => {
    const store = new InMemoryStore();
    vi.spyOn(store as any, "validate").mockImplementation(() => {
      throw new Error("too big");
    });

    expect(() => store.setUserGroups("k", [], "p")).toThrow("too big");
    expect(() => store.setUserInfo("k", "nope", "p")).toThrow(TypeError);
  });

  it("lets webAuthn take validation errors throw", async () => {
    const store = new RejectingStore();
    const takeSpy = vi.spyOn(store as any, "take");
    const removeSpy = vi.spyOn(store as any, "remove");

    await expect(store.takeWebAuthnSession("k")).rejects.toThrow("too big");
    await expect(store.deleteWebAuthnSession("k")).rejects.toThrow("too big");
    expect(takeSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("does not swallow storage errors behind the read-miss catch", async () => {
    const store = new InMemoryStore();
    vi.spyOn(store as any, "validate").mockImplementation(() => {});
    vi.spyOn(store as any, "read").mockRejectedValue(new Error("db down"));

    await expect(store.getOpenIDState("k", "p")).rejects.toThrow("db down");
  });

  it("propagates take storage errors instead of reporting a miss", async () => {
    const store = new InMemoryStore();
    vi.spyOn(store as any, "validate").mockImplementation(() => {});
    vi.spyOn(store as any, "take").mockRejectedValue(new Error("db down"));

    await expect(store.takeLoginResult("k")).rejects.toThrow("db down");
    await expect(store.takeWebAuthnSession("k")).rejects.toThrow("db down");
  });

  it("forwards the take context to the row key", async () => {
    const store = new InMemoryStore();
    const rowKeySpy = vi.spyOn(store, "rowKey");

    await store.setWebAuthnSession("s1", { status: "ready", token: "t" });
    rowKeySpy.mockClear();
    await store.takeWebAuthnSession("s1");
    expect(rowKeySpy).toHaveBeenCalledWith("webAuthn", "s1", undefined);
  });

  it("forwards a non-undefined take context to the row key on both kinds", async () => {
    const store = new InMemoryStore() as any;
    const rowKeySpy = vi.spyOn(store, "rowKey");
    const context = { providerId: "probe" };

    rowKeySpy.mockClear();
    await store.take("webAuthn", "k1", context);
    expect(rowKeySpy).toHaveBeenCalledWith("webAuthn", "k1", context);
    expect(rowKeySpy.mock.calls.find(([k]) => k === "webAuthn")?.[2]).toBe(context);

    rowKeySpy.mockClear();
    await store.take("loginResult", "k2", context);
    expect(rowKeySpy).toHaveBeenCalledWith("loginResult", "k2", context);
    expect(rowKeySpy.mock.calls.find(([k]) => k === "loginResult")?.[2]).toBe(context);
  });
});

describe("remove cache partitions", () => {
  it("removes state kinds from the state cache and data kinds from the data cache", async () => {
    const store = new InMemoryStore();
    await store.setOpenIDState("s", "n", "p");
    await store.setUserInfo("u", { a: 1 }, "p");
    await store.setUserGroups("g", ["x"], "p");
    await store.setWebAuthnSession("w", { status: "ready", token: "t" });
    await store.setLoginResult("c", { username: "u", uiToken: "ui", npmToken: "npm" });

    await store.deleteOpenIDState("s", "p");
    await (store as any).remove("userInfo", "u", { providerId: "p" });
    await (store as any).remove("userGroups", "g", { providerId: "p" });
    await store.deleteWebAuthnSession("w");
    await store.takeLoginResult("c");

    await expect(store.getOpenIDState("s", "p")).resolves.toBeUndefined();
    await expect(store.getUserInfo("u", "p")).resolves.toBeUndefined();
    await expect(store.getUserGroups("g", "p")).resolves.toBeUndefined();
    await expect(store.getWebAuthnSession("w")).resolves.toBeUndefined();
  });

  it("drops every kind through a single delete call on Dynamo and Mongo backends", async () => {
    for (const store of [new DynamoStore({ tableName: "t", region: "r" }), new MongoStore({ uri: "mongodb://x" })]) {
      const delSpy = vi.spyOn(store as any, "del").mockResolvedValue(undefined);
      for (const kind of ["state", "userInfo", "userGroups", "webAuthn", "loginResult"] as const) {
        delSpy.mockClear();
        await (store as any).remove(kind, "k", { providerId: "p" });
        expect(delSpy).toHaveBeenCalledTimes(1);
      }
    }
  });
});
