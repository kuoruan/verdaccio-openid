import type { ConfigHolder } from "@/server/config/Config";

import DynamoStore from "./Dynamo";
import FileStore from "./File";
import InMemoryStore from "./InMemory";
import RedisStore from "./Redis";
import { type Store, StoreType } from "./Store";

export function createStore(config: ConfigHolder): Store {
  const storeType = config.storeType;

  const storeConfig = config.getStoreConfig(storeType);

  switch (storeType) {
    case StoreType.Redis: {
      return new RedisStore(storeConfig);
    }
    case StoreType.File: {
      return new FileStore(storeConfig);
    }
    case StoreType.DynamoDB: {
      return new DynamoStore(storeConfig);
    }

    default: {
      return new InMemoryStore(storeConfig);
    }
  }
}
