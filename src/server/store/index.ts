import type { ConfigHolder } from "@/server/config/Config";

import InMemoryStore from "./InMemory";
import JsonFileStore from "./JsonFile";
import RedisStore from "./Redis";
import { type Store, StoreType } from "./Store";

export function createStore(config: ConfigHolder): Store {
  const storeType = config.storeType;

  switch (storeType) {
    case StoreType.Redis: {
      const storeConfig = config.getStoreConfig(StoreType.Redis);

      return new RedisStore(storeConfig);
    }
    case StoreType.JsonFile: {
      const storeConfig = config.getStoreConfig(StoreType.JsonFile);

      return new JsonFileStore(storeConfig);
    }

    default: {
      const storeConfig = config.getStoreConfig(StoreType.InMemory);

      return new InMemoryStore(storeConfig);
    }
  }
}
