import { defaultSecurity } from "@verdaccio/config";
import type { Config, PackageList, Security } from "@verdaccio/types";
import merge from "deepmerge";
import { boolean, mixed, object, Schema, string } from "yup";

import { plugin, pluginKey } from "@/constants";
import { CONFIG_ENV_NAME_REGEX } from "@/server/constants";
import { ProviderType } from "@/server/plugin/AuthProvider";
import { type FileConfig, type InMemoryConfig, type RedisConfig, StoreType } from "@/server/store/Store";

import { FileConfigSchema, InMemoryConfigSchema, RedisConfigSchema, RedisStoreConfigHolder } from "./Store";
import { getEnvironmentValue, getStoreFilePath, getTTLValue, handleValidationError } from "./utils";

export interface ConfigHolder {
  providerHost: string;
  providerType?: ProviderType;
  configurationUri?: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  usernameClaim: string;
  groupsClaim?: string;
  authorizedGroups: string | string[] | boolean;
  groupUsers?: Record<string, string[]>;
  storeType: StoreType;

  secret: string;
  security: Security;
  urlPrefix: string;
  packages: PackageList;

  keepPasswdLogin: boolean;
  getStoreConfig(storeType: StoreType): any;
}

export interface OpenIDConfig {
  "provider-host": string;
  "provider-type"?: ProviderType;
  "configuration-uri"?: string;
  issuer?: string;
  "authorization-endpoint"?: string;
  "userinfo-endpoint"?: string;
  "token-endpoint"?: string;
  "jwks-uri"?: string;
  scope?: string;
  "client-id"?: string;
  "client-secret"?: string;
  "username-claim"?: string;
  "groups-claim"?: string;
  "store-type"?: StoreType;
  "store-config"?: Record<string, unknown> | string;
  "keep-passwd-login"?: boolean;
  "authorized-groups"?: string | string[] | boolean;
  "group-users"?: string | Record<string, string[]>;
}

export default class ParsedPluginConfig implements ConfigHolder {
  constructor(
    private readonly config: OpenIDConfig,
    private readonly verdaccioConfig: Config,
  ) {}

  public get secret(): string {
    return this.verdaccioConfig.secret;
  }

  public get security(): Security {
    return merge(defaultSecurity, this.verdaccioConfig.security ?? {});
  }

  public get packages(): PackageList {
    return this.verdaccioConfig.packages ?? {};
  }

  public get urlPrefix(): string {
    return this.verdaccioConfig.url_prefix ?? "";
  }

  private getConfigValue<T>(key: keyof OpenIDConfig, schema: Schema): T {
    const valueOrEnvironmentName =
      this.config[key] ??
      this.verdaccioConfig.auth?.[pluginKey]?.[key] ??
      this.verdaccioConfig.middlewares?.[pluginKey]?.[key];

    /**
     * If the value is not defined in the config, use the plugin name and key as the environment variable name.
     *
     * eg. client-id -> `VERDACCIO_OPENID_CLIENT_ID`
     */
    const environmentName: string =
      typeof valueOrEnvironmentName === "string" && CONFIG_ENV_NAME_REGEX.test(valueOrEnvironmentName)
        ? valueOrEnvironmentName
        : `${plugin.name}-${key}`.toUpperCase().replaceAll("-", "_");

    /**
     * Allow environment variables to be used as values.
     */
    const value = getEnvironmentValue(environmentName) ?? valueOrEnvironmentName;

    try {
      schema.validateSync(value);
    } catch (error: any) {
      handleValidationError(error, key);
    }

    return value as T;
  }

  public get providerHost() {
    return this.getConfigValue<string>("provider-host", string().url().required());
  }

  public get providerType() {
    return this.getConfigValue<ProviderType | undefined>(
      "provider-type",
      string()
        .oneOf([ProviderType.Gitlab] satisfies ProviderType[])
        .optional(),
    );
  }

  public get configurationUri() {
    return this.getConfigValue<string | undefined>("configuration-uri", string().url().optional());
  }

  public get issuer() {
    return this.getConfigValue<string | undefined>("issuer", string().url().optional());
  }

  public get authorizationEndpoint() {
    return this.getConfigValue<string | undefined>("authorization-endpoint", string().url().optional());
  }

  public get tokenEndpoint() {
    return this.getConfigValue<string | undefined>("token-endpoint", string().url().optional());
  }

  public get userinfoEndpoint() {
    return this.getConfigValue<string | undefined>("userinfo-endpoint", string().url().optional());
  }

  public get jwksUri() {
    return this.getConfigValue<string | undefined>("jwks-uri", string().url().optional());
  }

  public get scope() {
    return this.getConfigValue<string | undefined>("scope", string().optional()) ?? "openid";
  }

  public get clientId() {
    return this.getConfigValue<string>("client-id", string().required());
  }

  public get clientSecret() {
    return this.getConfigValue<string>("client-secret", string().required());
  }

  public get usernameClaim() {
    return this.getConfigValue<string | undefined>("username-claim", string().optional()) ?? "sub";
  }

  public get groupsClaim() {
    return this.getConfigValue<string | undefined>("groups-claim", string().optional());
  }

  public get authorizedGroups() {
    return (
      this.getConfigValue<string | string[] | boolean>(
        "authorized-groups",
        mixed()
          .test({
            name: "is-string-array-or-boolean",
            skipAbsent: true,
            message: "must be a string, string[] or a boolean",
            test: (value) => {
              if (Array.isArray(value)) {
                return value.every((item) => typeof item === "string");
              }
              return typeof value === "string" || typeof value === "boolean";
            },
          })
          .optional(),
      ) ?? false
    );
  }

  public get groupUsers() {
    return this.getConfigValue<Record<string, string[]> | undefined>(
      "group-users",
      object()
        .test({
          name: "is-record-of-string-arrays",
          skipAbsent: true,
          message: "must be a Record<string, string[]>",
          test: (value) => {
            if (typeof value !== "object" || value === null) {
              return false;
            }
            return Object.values(value).every(
              (item) => Array.isArray(item) && item.every((subItem) => typeof subItem === "string"),
            );
          },
        })
        .optional(),
    );
  }

  public get storeType() {
    return (
      this.getConfigValue<StoreType>(
        "store-type",
        string()
          .oneOf([StoreType.InMemory, StoreType.Redis, StoreType.File] satisfies StoreType[])
          .optional(),
      ) ?? StoreType.InMemory
    );
  }

  public getStoreConfig(storeType: StoreType) {
    const configKey: keyof OpenIDConfig = "store-config";

    switch (storeType) {
      case StoreType.InMemory: {
        const storeConfig = this.getConfigValue<InMemoryConfig | undefined>(configKey, InMemoryConfigSchema.optional());

        if (storeConfig === undefined) return;

        return { ...storeConfig, ttl: getTTLValue(storeConfig.ttl) } satisfies InMemoryConfig;
      }

      case StoreType.Redis: {
        const storeConfig = this.getConfigValue<RedisConfig | string | undefined>(
          configKey,
          mixed().test({
            name: "is-redis-config-or-redis-url",
            message: "must be a RedisConfig or a string",
            test: (value) => {
              if (value === undefined) return true;
              if (typeof value === "string" && value !== "") {
                return string()
                  .matches(/^rediss?:\/\//)
                  .isValidSync(value);
              }
              if (typeof value === "object" && value !== null) {
                return RedisConfigSchema.isValidSync(value);
              }
              return false;
            },
          }),
        );

        if (storeConfig === undefined) return;

        if (typeof storeConfig === "string") {
          return storeConfig;
        }

        const configHolder = new RedisStoreConfigHolder(storeConfig, configKey);

        return {
          ...storeConfig,
          username: configHolder.username,
          password: configHolder.password,
          ttl: getTTLValue(storeConfig.ttl),
        } satisfies RedisConfig;
      }

      case StoreType.File: {
        const config = this.getConfigValue<FileConfig>(
          configKey,
          mixed().test({
            name: "is-file-config-or-string",
            message: "must be a FileConfig or a string",
            test: (value) => {
              if (typeof value === "string" && value !== "") {
                return true;
              }
              if (typeof value === "object" && value !== null) {
                return FileConfigSchema.isValidSync(value);
              }
              return false;
            },
          }),
        );

        const configPath = this.verdaccioConfig.configPath ?? this.verdaccioConfig.self_path;

        if (typeof config === "string") {
          return getStoreFilePath(configPath, config);
        }

        return {
          ...config,
          dir: getStoreFilePath(configPath, config.dir),
          ttl: getTTLValue(config.ttl),
        } satisfies FileConfig;
      }

      default: {
        handleValidationError(new Error(`Unsupported store type: ${String(storeType)}`), "store-type");
      }
    }
  }

  public get keepPasswdLogin(): boolean {
    return (
      this.getConfigValue<boolean | undefined>("keep-passwd-login", boolean().optional()) ??
      this.verdaccioConfig.auth?.htpasswd?.file !== undefined
    );
  }
}
