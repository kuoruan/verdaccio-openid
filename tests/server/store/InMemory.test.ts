import { describe, expect, it } from "vitest";

import InMemoryStore from "@/server/store/InMemory";
import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS } from "@/server/store/constants";
import { isUndefined } from "@/utils";

describe("InMemoryStore constructor", () => {
  it("should create instance with default options", () => {
    const store = new InMemoryStore();
    expect(store).toBeInstanceOf(InMemoryStore);
  });

  it("should create stateCache with custom TTL", () => {
    const customTTL = 60_000;
    const store = new InMemoryStore({ ttl: customTTL });
    // @ts-expect-error accessing private field for testing
    expect(store.stateCache.ttl).toBe(customTTL);
  });

  it("should create stateCache with default TTL if not specified", () => {
    const store = new InMemoryStore();
    // @ts-expect-error accessing private field for testing
    expect(store.stateCache.ttl).toBe(DEFAULT_STATE_TTL_MS);
  });

  it("should fall back to the default TTL instead of throwing on an explicit undefined", () => {
    const store = new InMemoryStore({ ttl: undefined });
    // @ts-expect-error accessing private field for testing
    expect(store.stateCache.ttl).toBe(DEFAULT_STATE_TTL_MS);

    expect(() => store.setOpenIDState("key", "nonce", "provider")).not.toThrow();
  });

  it("should create dataCache with correct TTL and max", () => {
    const store = new InMemoryStore();
    // @ts-expect-error accessing private field for testing
    expect(store.dataCache.ttl).toBe(DEFAULT_DATA_TTL_MS);
    // @ts-expect-error accessing private field for testing
    expect(store.dataCache.max).toBe(2000);
  });
});

describe("InMemoryStore methods", () => {
  it("should manage state in cache correctly", async () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const nonce = "testNonce";
    const providerId = "testProvider";

    await store.setOpenIDState(key, nonce, providerId);
    await expect(Promise.resolve(store.getOpenIDState(key, providerId))).resolves.toBe(nonce);

    await store.deleteOpenIDState(key, providerId);
    await expect(Promise.resolve(store.getOpenIDState(key, providerId))).resolves.toBeUndefined();
  });

  it("should manage user info in cache correctly", async () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const providerId = "testProvider";
    const userInfo = { name: "Test User" };

    await store.setUserInfo(key, userInfo, providerId);
    await expect(Promise.resolve(store.getUserInfo(key, providerId))).resolves.toEqual(userInfo);
    await expect(Promise.resolve(store.getUserInfo("wrongKey", providerId))).resolves.toBeUndefined();
  });

  it("should manage user groups in cache correctly", async () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const providerId = "testProvider";
    const groups = ["group1", "group2"];

    await store.setUserGroups(key, groups, providerId);
    await expect(Promise.resolve(store.getUserGroups(key, providerId))).resolves.toEqual(groups);
    await expect(Promise.resolve(store.getUserGroups("wrongKey", providerId))).resolves.toBeUndefined();
  });

  it("should take ready webauthn session and delete it", async () => {
    const store = new InMemoryStore();

    await store.setWebAuthnSession("session-1", { status: "ready", token: "issued-token" });

    await expect(store.takeWebAuthnSession("session-1")).resolves.toEqual({
      status: "ready",
      token: "issued-token",
    });
    await expect(store.getWebAuthnSession("session-1")).resolves.toBeUndefined();
  });

  it("should hand out a login result once", async () => {
    const store = new InMemoryStore();

    await store.setLoginResult("state-1", { username: "dave", uiToken: "ui", npmToken: "npm" });

    await expect(store.takeLoginResult("state-1")).resolves.toEqual({
      username: "dave",
      uiToken: "ui",
      npmToken: "npm",
    });
    await expect(store.takeLoginResult("state-1")).resolves.toBeUndefined();
  });

  it("should keep login results apart from the openid state of the same key", async () => {
    const store = new InMemoryStore();

    await store.setOpenIDState("shared", "nonce", "openid");
    await store.setLoginResult("shared", { username: "dave", uiToken: "ui", npmToken: "npm" });

    await expect(Promise.resolve(store.getOpenIDState("shared", "openid"))).resolves.toBe("nonce");
    await expect(store.takeLoginResult("shared")).resolves.toEqual({
      username: "dave",
      uiToken: "ui",
      npmToken: "npm",
    });
    await expect(Promise.resolve(store.getOpenIDState("shared", "openid"))).resolves.toBe("nonce");
  });

  it("should report a corrupted login result as a miss", async () => {
    const store = new InMemoryStore();

    await store.setLoginResult("bad", { username: "dave", uiToken: "ui", npmToken: "npm" } as any);
    (store as any).stateCache.set("openid-login:login:bad", "not-json");

    await expect(store.takeLoginResult("bad")).resolves.toBeUndefined();

    (store as any).stateCache.set("openid-login:login:bad", '{"username":"dave"}');
    await expect(store.takeLoginResult("bad")).resolves.toBeUndefined();
  });

  it("should hand out a login result to only one of two concurrent takers", async () => {
    const store = new InMemoryStore();

    await store.setLoginResult("race", { username: "dave", uiToken: "ui", npmToken: "npm" });

    const [first, second] = await Promise.all([store.takeLoginResult("race"), store.takeLoginResult("race")]);
    const winners = [first, second].filter((r) => !isUndefined(r));

    expect(winners).toHaveLength(1);
    expect(winners[0]).toEqual({ username: "dave", uiToken: "ui", npmToken: "npm" });
    await expect(Promise.resolve(store.takeLoginResult("race"))).resolves.toBeUndefined();
  });

  it("should hand out a ready webauthn token to only one of two concurrent takers", async () => {
    const store = new InMemoryStore();

    await store.setWebAuthnSession("race", { status: "ready", token: "issued-token" });

    const [first, second] = await Promise.all([store.takeWebAuthnSession("race"), store.takeWebAuthnSession("race")]);
    const winners = [first, second].filter((r) => !isUndefined(r));

    expect(winners).toHaveLength(1);
    expect(winners[0]).toEqual({ status: "ready", token: "issued-token" });
    await expect(Promise.resolve(store.takeWebAuthnSession("race"))).resolves.toBeUndefined();
  });

  it("should still hand out a ready session after a non-destructive read", async () => {
    const store = new InMemoryStore();

    await store.setWebAuthnSession("session-1", { status: "ready", token: "issued-token" });

    await expect(Promise.resolve(store.getWebAuthnSession("session-1"))).resolves.toEqual({
      status: "ready",
      token: "issued-token",
    });
    await expect(store.takeWebAuthnSession("session-1")).resolves.toEqual({
      status: "ready",
      token: "issued-token",
    });
    await expect(Promise.resolve(store.getWebAuthnSession("session-1"))).resolves.toBeUndefined();
  });

  it("should keep pending webauthn session when taking", async () => {
    const store = new InMemoryStore();

    await store.setWebAuthnSession("session-1", { status: "pending" });

    await expect(store.takeWebAuthnSession("session-1")).resolves.toEqual({ status: "pending" });
    await expect(store.getWebAuthnSession("session-1")).resolves.toEqual({ status: "pending" });
  });
});
