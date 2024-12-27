import { array, type Schema, string } from "yup";
import { number, object } from "yup";

import { plugin } from "@/constants";
import { CONFIG_ENV_NAME_REGEX } from "@/server/constants";
import { type InMemoryConfig, type RedisConfig, StoreType } from "@/server/store/Store";

import { getEnvironmentValue, handleValidationError } from "./utils";

export const InMemoryConfigSchema = object<InMemoryConfig>({
  max: number().min(1).optional(),
  min: number().min(1).optional(),
});

const portSchema = number().min(1).max(65_535);

export const RedisConfigSchema = object<RedisConfig>({
  username: string().optional(),
  password: string().optional(),
  port: portSchema.optional(),

  ttl: number().min(1).optional(),

  nodes: array()
    .of(
      object({
        host: string().optional(),
        port: portSchema.optional(),
      }),
    )
    .optional(),
});

abstract class StoreConfig<T> {
  constructor(
    private config: Record<string, unknown>,
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

  abstract storeType: StoreType;
}

export class RedisStoreConfigHolder extends StoreConfig<RedisConfig> {
  get username() {
    return this.getConfigValue("username", string().optional());
  }

  get password() {
    return this.getConfigValue("password", string().optional());
  }

  get storeType() {
    return StoreType.Redis;
  }
}
