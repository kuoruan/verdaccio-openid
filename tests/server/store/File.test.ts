import storage from "node-persist";
import type { MockInstance } from "vitest";

import FileStore from "@/server/store/File";
import type { FileConfig } from "@/server/store/Store";

vi.mock("node-persist");

describe("FileStore constructor", () => {
  it("should initialize with default options when opts is a string", async () => {
    const initMock = vi.fn().mockResolvedValue(true);
    (storage.create as unknown as MockInstance).mockReturnValue({ init: initMock });

    const fileStore = new FileStore("/some/dir");

    expect(fileStore).not.toBeFalsy();

    expect(storage.create).toHaveBeenCalledWith({
      ttl: expect.any(Number),
      dir: "/some/dir",
    });
    expect(initMock).toHaveBeenCalled();
  });

  it("should initialize with provided options when opts is an object", async () => {
    const initMock = vi.fn().mockResolvedValue(true);
    (storage.create as unknown as MockInstance).mockReturnValue({ init: initMock });

    const opts: FileConfig = {
      ttl: 1000,
      expiredInterval: 250,
      dir: "/some/dir",
    };
    const fileStore = new FileStore(opts);

    expect(fileStore).not.toBeFalsy();
    expect(storage.create).toHaveBeenCalledWith(opts);
    expect(initMock).toHaveBeenCalled();
  });
});
