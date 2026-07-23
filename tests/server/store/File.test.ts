import type { MockInstance } from "vitest";

import FileStore from "@/server/store/File";
import type { FileConfig } from "@/server/store/Store";

vi.mock("node-persist");
vi.mock("@/server/logger");

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
      dir: "/test/dir",
    });
    expect(initMock).toHaveBeenCalled();
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

  it("should take ready webauthn token and delete it", async () => {
    dbMock.getItem.mockResolvedValue("issued-token");

    await expect(fileStore.takeWebAuthnToken("session1", "__pending__")).resolves.toBe("issued-token");

    expect(dbMock.removeItem).toHaveBeenCalledWith("authn:session1");
  });

  it("should keep pending webauthn token when taking", async () => {
    dbMock.getItem.mockResolvedValue("__pending__");

    await expect(fileStore.takeWebAuthnToken("session1", "__pending__")).resolves.toBe("__pending__");

    expect(dbMock.removeItem).not.toHaveBeenCalled();
  });
});
