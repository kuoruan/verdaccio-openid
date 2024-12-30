import type { ConfigHolder } from "@/server/config/Config";

import FileStore from "./File";
import InMemoryStore from "./InMemory";
import RedisStore from "./Redis";
import { type Store, StoreType } from "./Store";

export function createStore(config: ConfigHolder): Store {
  const storeType = config.storeType;

  switch (storeType) {
    case StoreType.Redis: {
      const storeConfig = config.getStoreConfig(StoreType.Redis);

      return new RedisStore(storeConfig);
    }
    case StoreType.File: {
      const storeConfig = config.getStoreConfig(StoreType.File);

      return new FileStore(storeConfig);
    }

    default: {
      const storeConfig = config.getStoreConfig(StoreType.InMemory);

      return new InMemoryStore(storeConfig);
    }
  }
}
