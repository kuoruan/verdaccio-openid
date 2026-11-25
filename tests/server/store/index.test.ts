import { describe, expect, it, vi } from "vitest";

import { createStore } from "@/server/store";
import { StoreType } from "@/server/store/Store";
import FileStore from "@/server/store/File";
import InMemoryStore from "@/server/store/InMemory";
import MongoStore from "@/server/store/Mongo";
import RedisStore from "@/server/store/Redis";

function mockConfig(storeType: StoreType, storeConfig: unknown = {}) {
  return {
    storeType,
    getStoreConfig: vi.fn().mockReturnValue(storeConfig),
  } as any;
}

describe("createStore", () => {
  it("should return InMemoryStore for default store type", () => {
    const config = mockConfig(StoreType.InMemory);
    const store = createStore(config);

    expect(store).toBeInstanceOf(InMemoryStore);
    expect(config.getStoreConfig).toHaveBeenCalledWith(StoreType.InMemory);
  });

  it("should return InMemoryStore for unknown store type", () => {
    const config = mockConfig("unknown" as StoreType);
    const store = createStore(config);

    expect(store).toBeInstanceOf(InMemoryStore);
    expect(config.getStoreConfig).toHaveBeenCalledWith("unknown");
  });

  it("should return RedisStore for redis store type", () => {
    const config = mockConfig(StoreType.Redis);
    const store = createStore(config);

    expect(store).toBeInstanceOf(RedisStore);
    expect(config.getStoreConfig).toHaveBeenCalledWith(StoreType.Redis);
  });

  it("should return FileStore for file store type", () => {
    const config = mockConfig(StoreType.File);
    const store = createStore(config);

    expect(store).toBeInstanceOf(FileStore);
    expect(config.getStoreConfig).toHaveBeenCalledWith(StoreType.File);
  });

  it("should return MongoStore for mongodb store type", () => {
    const config = mockConfig(StoreType.MongoDB, { uri: "mongodb://localhost:27017" });
    const store = createStore(config);

    expect(store).toBeInstanceOf(MongoStore);
    expect(config.getStoreConfig).toHaveBeenCalledWith(StoreType.MongoDB);
  });
});
