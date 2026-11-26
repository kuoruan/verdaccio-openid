import { array, mixed, type Schema, string } from "yup";
import { number, object } from "yup";

import { plugin } from "@/constants";
import {
  type DynamoConfig,
  type FileConfig,
  type InMemoryConfig,
  type MongoConfig,
  type RedisConfig,
} from "@/server/store/Store";
import { isObject, isUndefined } from "@/utils";

import { getTTLValue, handleValidationError, resolveConfigValue } from "./utils";

/** Smallest `ttl` a number may express, in milliseconds. */
const MIN_TTL_MS = 1000;

const portSchema = number().min(1).max(65_535);
const ttlSchema = mixed().test({
  name: "is-duration",
  message: `must be a duration like "5m", or a number of milliseconds above ${MIN_TTL_MS}`,
  test: (value) => {
    if (isUndefined(value)) return true;

    // The number threshold predates the conversion and stays as it was: a value
    // below it is a config error, not a duration to be rounded. Infinity would
    // slip through a plain comparison and then be dropped as unset.
    if (typeof value === "number") return Number.isFinite(value) && value > MIN_TTL_MS;
    if (typeof value !== "string") return false;

    return !isUndefined(getTTLValue(value));
  },
});

export const InMemoryConfigSchema = object<InMemoryConfig>({
  ttl: ttlSchema,

  max: number().min(1).optional(),
});

const nodeObjectSchema = object({
  host: string().optional(),
  port: portSchema.optional(),
});

export const RedisConfigSchema = object<RedisConfig>({
  username: string().optional(),
  password: string().optional(),
  port: portSchema.optional(),

  ttl: ttlSchema,

  nodes: array()
    .of(
      mixed().test({
        name: "is-valid-node",
        message: "must be an object, number, or string.",
        test: (value) => {
          if (isObject(value)) {
            return nodeObjectSchema.isValidSync(value);
          }

          return typeof value === "number" || typeof value === "string";
        },
      }),
    )
    .optional(),
});

export const FileConfigSchema = object<FileConfig>({
  ttl: ttlSchema,

  dir: string().required(),
  expiredInterval: number().min(1).optional(),
});

export const DynamoConfigSchema = object<DynamoConfig>({
  ttl: ttlSchema,
  tableName: string().required(),
  region: string().required(),
  partitionKey: string().optional(),
});

export const MongoConfigSchema = object<MongoConfig>({
  ttl: ttlSchema,
  // `uri` may also arrive through its environment variable; the config
  // holder enforces that one of the two is present.
  uri: string().optional(),
  database: string().optional(),
  collection: string().optional(),
});

abstract class StoreConfig<T> {
  constructor(
    private config: T,
    private configKey: string,
  ) {}

  protected getConfigValue<K extends keyof T & string>(key: K, schema: Schema): T[K] {
    const valueOrEnvironmentName = this.config[key];

    const value = resolveConfigValue(valueOrEnvironmentName, `${plugin.name}-${this.configKey}-${key}`);

    try {
      schema.validateSync(value);
    } catch (error: any) {
      handleValidationError(error, this.configKey, key);
    }

    return value as T[K];
  }
}

export class RedisStoreConfigHolder extends StoreConfig<RedisConfig> {
  get username() {
    return this.getConfigValue("username", string().optional());
  }

  get password() {
    return this.getConfigValue("password", string().optional());
  }
}

export class DynamoStoreConfigHolder extends StoreConfig<DynamoConfig> {
  get tableName() {
    return this.getConfigValue("tableName", string().required());
  }

  get region() {
    return this.getConfigValue("region", string().required());
  }

  get partitionKey() {
    return this.getConfigValue("partitionKey", string().optional());
  }
}

export class MongoStoreConfigHolder extends StoreConfig<MongoConfig> {
  get uri() {
    return this.getConfigValue("uri", string().required());
  }

  get database() {
    return this.getConfigValue("database", string().optional());
  }

  get collection() {
    return this.getConfigValue("collection", string().optional());
  }
}
