import { describe, expect, it } from "vitest";

import InMemoryStore from "@/server/store/InMemory";
import { DATA_CACHE_TTL, STATE_TTL } from "@/server/store/Store";

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
    expect(store.stateCache.ttl).toBe(STATE_TTL);
  });

  it("should create dataCache with correct TTL and max", () => {
    const store = new InMemoryStore();
    // @ts-expect-error accessing private field for testing
    expect(store.dataCache.ttl).toBe(DATA_CACHE_TTL);
    // @ts-expect-error accessing private field for testing
    expect(store.dataCache.max).toBe(2000);
  });
});

describe("InMemoryStore methods", () => {
  it("should manage state in cache correctly", () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const nonce = "testNonce";
    const providerId = "testProvider";

    store.setOpenIDState(key, nonce, providerId);
    expect(store.getOpenIDState(key, providerId)).toBe(nonce);

    store.deleteOpenIDState(key, providerId);
    expect(store.getOpenIDState(key, providerId)).toBeUndefined();
  });

  it("should manage user info in cache correctly", () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const providerId = "testProvider";
    const userInfo = { name: "Test User" };

    store.setUserInfo(key, userInfo, providerId);
    expect(store.getUserInfo(key, providerId)).toEqual(userInfo);
    expect(store.getUserInfo("wrongKey", providerId)).toBeUndefined();
  });

  it("should manage user groups in cache correctly", () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const providerId = "testProvider";
    const groups = ["group1", "group2"];

    store.setUserGroups(key, groups, providerId);
    expect(store.getUserGroups(key, providerId)).toEqual(groups);
    expect(store.getUserGroups("wrongKey", providerId)).toBeUndefined();
  });
});
