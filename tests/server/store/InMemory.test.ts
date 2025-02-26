import InMemoryStore from "@/server/store/InMemory";
import { STATE_TTL, USER_GROUPS_CACHE_TTL, USER_INFO_CACHE_TTL } from "@/server/store/Store";
import { describe, expect, it } from "vitest";

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

  it("should create userinfoCache with correct TTL and max", () => {
    const store = new InMemoryStore();
    // @ts-expect-error accessing private field for testing
    expect(store.userinfoCache.ttl).toBe(USER_INFO_CACHE_TTL);
    // @ts-expect-error accessing private field for testing
    expect(store.userinfoCache.max).toBe(1000);
  });

  it("should create groupsCache with correct TTL and max", () => {
    const store = new InMemoryStore();
    // @ts-expect-error accessing private field for testing
    expect(store.groupsCache.ttl).toBe(USER_GROUPS_CACHE_TTL);
    // @ts-expect-error accessing private field for testing
    expect(store.groupsCache.max).toBe(1000);
  });
});

describe("InMemoryStore methods", () => {
  it("should manage state in cache correctly", () => {
    const store = new InMemoryStore();
    const key = "testKey";
    const nonce = "testNonce";
    const providerId = "testProvider";

    store.setState(key, nonce, providerId);
    expect(store.getState(key, providerId)).toBe(nonce);

    store.deleteState(key, providerId);
    expect(store.getState(key, providerId)).toBeUndefined();
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
