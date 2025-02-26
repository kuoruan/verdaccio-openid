import { plugin } from "@/constants";
import { CONFIG_ENV_NAME_REGEX } from "@/server/constants";
import { type FileConfig, type InMemoryConfig, type RedisConfig, StoreType } from "@/server/store/Store";
import { array, mixed, type Schema, string } from "yup";
import { number, object } from "yup";

import { getEnvironmentValue, handleValidationError } from "./utils";

const portSchema = number().min(1).max(65_535);
const ttlSchema = mixed().test({
  message: "must be a time string or integer",
  name: "is-time-string-or-integer",
  test: (value) => {
    return (
      value === undefined || (typeof value === "string" && value !== "") || (typeof value === "number" && value > 1000) // 1 second
    );
  },
});

export const InMemoryConfigSchema = object<InMemoryConfig>({
  max: number().min(1).optional(),

  ttl: ttlSchema,
});

const nodeObjectSchema = object({
  host: string().optional(),
  port: portSchema.optional(),
});

export const RedisConfigSchema = object<RedisConfig>({
  nodes: array()
    .of(
      mixed().test({
        message: "must be an object, number, or string.",
        name: "is-valid-node",
        test: (value) => {
          if (typeof value === "object" && value !== null) {
            return nodeObjectSchema.isValidSync(value);
          }

          return typeof value === "number" || typeof value === "string";
        },
      }),
    )
    .optional(),
  password: string().optional(),
  port: portSchema.optional(),

  ttl: ttlSchema,

  username: string().optional(),
});

export const FileConfigSchema = object<FileConfig>({
  dir: string().required(),

  expiredInterval: number().min(1).optional(),
  ttl: ttlSchema,
});

abstract class StoreConfig<T> {
  abstract storeType: StoreType;

  constructor(
    private config: T,
    private configKey: string,
  ) {}

  protected getConfigValue<K extends keyof T>(key: K, schema: Schema): T[K] {
    const valueOrEnvironmentName = this.config[key as string] as string;

    const environmentName =
      typeof valueOrEnvironmentName === "string" && CONFIG_ENV_NAME_REGEX.test(valueOrEnvironmentName)
        ? valueOrEnvironmentName
        : `${plugin.name}-${this.configKey}-${key as string}`.toUpperCase().replaceAll("-", "_");

    /**
     * Allow environment variables to be used as values.
     */
    const value = getEnvironmentValue(environmentName) ?? valueOrEnvironmentName;

    try {
      schema.validateSync(value);
    } catch (error: any) {
      handleValidationError(error, this.configKey, key as string);
    }

    return value as T[K];
  }
}

export class RedisStoreConfigHolder extends StoreConfig<RedisConfig> {
  get password() {
    return this.getConfigValue("password", string().optional());
  }

  get storeType() {
    return StoreType.Redis;
  }

  get username() {
    return this.getConfigValue("username", string().optional());
  }
}
