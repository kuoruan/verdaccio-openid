import type { FileConfig } from "@/server/store/Store";
import type { MockInstance } from "vitest";

import logger from "@/server/logger";
import FileStore from "@/server/store/File";
import storage from "node-persist";

vi.mock("node-persist");
vi.mock("@/server/logger");

describe("FileStore constructor", () => {
  it("should initialize with default options when opts is a string", () => {
    const initMock = vi.fn().mockResolvedValue(true);
    (storage.create as unknown as MockInstance).mockReturnValue({ init: initMock });

    const fileStore = new FileStore("/some/dir");

    expect(fileStore).not.toBeFalsy();

    expect(storage.create).toHaveBeenCalledWith({
      dir: "/some/dir",
      ttl: expect.any(Number),
    });
    expect(initMock).toHaveBeenCalled();
  });

  it("should initialize with provided options when opts is an object", () => {
    const initMock = vi.fn().mockResolvedValue(true);
    (storage.create as unknown as MockInstance).mockReturnValue({ init: initMock });

    const opts: FileConfig = {
      dir: "/some/dir",
      expiredInterval: 250,
      ttl: 1000,
    };
    const fileStore = new FileStore(opts);

    expect(fileStore).not.toBeFalsy();
    expect(storage.create).toHaveBeenCalledWith(opts);
    expect(initMock).toHaveBeenCalled();
  });

  it("should throw an error when init fails", () => {
    const initMock = vi.fn().mockRejectedValue(new Error("init failed"));
    (storage.create as unknown as MockInstance).mockReturnValue({ init: initMock });

    const exitMock = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never;
    });

    expect(() => new FileStore("/some/dir")).not.toThrow();

    process.nextTick(() => {
      expect(exitMock).toHaveBeenCalledWith(1);

      expect(logger.error).toHaveBeenCalledWith(
        { message: "init failed" },
        "Failed to initialize file store: @{message}",
      );
    });
  });
});

describe("FileStore methods", () => {
  let fileStore: FileStore;
  let dbMock: {
    getItem: MockInstance;
    removeItem: MockInstance;
    setItem: MockInstance;
  };

  beforeEach(() => {
    dbMock = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    (storage.create as unknown as MockInstance).mockReturnValue({
      init: vi.fn().mockResolvedValue(true),
      ...dbMock,
    });

    fileStore = new FileStore("/test/dir");
  });

  it("should set and get state", async () => {
    await fileStore.setState("key1", "nonce1", "provider1");
    dbMock.getItem.mockResolvedValue("nonce1");

    expect(dbMock.setItem).toHaveBeenCalledWith("provider1:state:key1", "nonce1");
    expect(await fileStore.getState("key1", "provider1")).toBe("nonce1");
  });

  it("should delete state", async () => {
    await fileStore.deleteState("key1", "provider1");
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
});
