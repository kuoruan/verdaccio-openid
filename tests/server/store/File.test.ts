import type { MockInstance } from "vitest";

import { vi } from "vitest";

import { chmod, mkdir } from "node:fs/promises";

import FileStore from "@/server/store/File";
import type { FileConfig } from "@/server/store/Store";

vi.mock("node-persist");
vi.mock("@/server/logger");
vi.mock("node:fs/promises", () => ({
  chmod: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe("FileStore constructor", () => {
  it("should not throw when opts is a string", () => {
    expect(() => new FileStore("/some/dir")).not.toThrow();
  });

  it("should not throw when opts is an object", () => {
    const opts: FileConfig = {
      ttl: 1000,
      expiredInterval: 250,
      dir: "/some/dir",
    };
    expect(() => new FileStore(opts)).not.toThrow();
  });
});

describe("FileStore methods", () => {
  let fileStore: FileStore;
  let dbMock: {
    setItem: MockInstance;
    getItem: MockInstance;
    removeItem: MockInstance;
  };
  let initMock: MockInstance;

  beforeEach(async () => {
    // Dynamically import node-persist to get the mocked module
    const storage = await import("node-persist");

    dbMock = {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn(),
    };
    initMock = vi.fn().mockResolvedValue(true);

    (storage.default.create as unknown as MockInstance).mockReturnValue({
      init: initMock,
      ...dbMock,
    });

    fileStore = new FileStore("/test/dir");
  });

  it("should initialize lazily on first operation", async () => {
    const storage = await import("node-persist");

    await fileStore.setOpenIDState("key1", "nonce1", "provider1");

    expect(storage.default.create).toHaveBeenCalledWith({
      ttl: expect.any(Number),
      forgiveParseErrors: true,
      dir: "/test/dir",
    });
    expect(initMock).toHaveBeenCalled();
  });

  it("should create the store directory readable by its owner only", async () => {
    await fileStore.setOpenIDState("key1", "nonce1", "provider1");

    expect(mkdir).toHaveBeenCalledWith("/test/dir", { recursive: true, mode: 0o700 });
    // A directory an earlier version left at 0755 is tightened as well.
    expect(chmod).toHaveBeenCalledWith("/test/dir", 0o700);
  });

  it("should keep a ttl the configuration asks for", async () => {
    const storage = await import("node-persist");
    const configured = new FileStore({ dir: "/test/dir", ttl: 5000 });

    await configured.setOpenIDState("key1", "nonce1", "provider1");

    expect(storage.default.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: "/test/dir",
        ttl: 5000,
        forgiveParseErrors: true,
      }),
    );
  });

  it("should set and get state", async () => {
    await fileStore.setOpenIDState("key1", "nonce1", "provider1");
    dbMock.getItem.mockResolvedValue("nonce1");

    expect(dbMock.setItem).toHaveBeenCalledWith("provider1:state:key1", "nonce1");
    expect(await fileStore.getOpenIDState("key1", "provider1")).toBe("nonce1");
  });

  it("should delete state", async () => {
    await fileStore.deleteOpenIDState("key1", "provider1");
    expect(dbMock.removeItem).toHaveBeenCalledWith("provider1:state:key1");
  });

  it("should set and get user info", async () => {
    const userInfo = { name: "test" };
    await fileStore.setUserInfo("key1", userInfo, "provider1");
    dbMock.getItem.mockResolvedValue(userInfo);

    expect(dbMock.setItem).toHaveBeenCalledWith("provider1:userinfo:key1", userInfo, expect.any(Object));
    expect(await fileStore.getUserInfo("key1", "provider1")).toEqual(userInfo);
  });

  it("should set and get user groups", async () => {
    const groups = ["group1", "group2"];
    await fileStore.setUserGroups("key1", groups, "provider1");
    dbMock.getItem.mockResolvedValue(groups);

    expect(dbMock.setItem).toHaveBeenCalledWith("provider1:groups:key1", groups, expect.any(Object));
    expect(await fileStore.getUserGroups("key1", "provider1")).toEqual(groups);
  });

  it("should take ready webauthn session and delete it", async () => {
    dbMock.getItem.mockResolvedValue("issued-token");

    await expect(fileStore.takeWebAuthnSession("session1")).resolves.toEqual({
      status: "ready",
      token: "issued-token",
    });

    expect(dbMock.removeItem).toHaveBeenCalledWith("authn:session1");
  });

  it("should store a login result under its own key", async () => {
    await fileStore.setLoginResult("state-1", { username: "dave", uiToken: "ui", npmToken: "npm" });

    expect(dbMock.setItem).toHaveBeenCalledWith(
      "openid-login:login:state-1",
      '{"username":"dave","uiToken":"ui","npmToken":"npm"}',
    );
  });

  it("should hand out a login result once", async () => {
    dbMock.getItem.mockResolvedValueOnce('{"username":"dave","uiToken":"ui","npmToken":"npm"}');

    await expect(fileStore.takeLoginResult("state-1")).resolves.toEqual({
      username: "dave",
      uiToken: "ui",
      npmToken: "npm",
    });
    expect(dbMock.removeItem).toHaveBeenCalledWith("openid-login:login:state-1");

    dbMock.getItem.mockResolvedValueOnce(undefined);

    await expect(fileStore.takeLoginResult("state-1")).resolves.toBeUndefined();
  });

  it("should keep pending webauthn session when taking", async () => {
    dbMock.getItem.mockResolvedValue("__pending__");

    await expect(fileStore.takeWebAuthnSession("session1")).resolves.toEqual({ status: "pending" });

    expect(dbMock.removeItem).not.toHaveBeenCalled();
  });

  it.each(["webAuthn", "loginResult"] as const)(
    "forwards a non-undefined take context to the row key (%s)",
    async (kind) => {
      const context = { providerId: "probe" };
      const rowKeySpy = vi.spyOn(fileStore as any, "rowKey");

      dbMock.getItem.mockResolvedValueOnce(null);
      await (fileStore as any).take(kind, "k1", context);

      expect(rowKeySpy).toHaveBeenCalledWith(kind, "k1", context);
      expect(rowKeySpy.mock.calls.find(([k]) => k === kind)?.[2]).toBe(context);
    },
  );

  it("should report a corrupted login result as a miss", async () => {
    for (const raw of ["not-json", '{"username":"dave"}', '["dave"]', "null"]) {
      dbMock.getItem.mockResolvedValueOnce(raw);

      await expect(fileStore.takeLoginResult("state-1")).resolves.toBeUndefined();
    }
  });
});
