import type { Config, PackageList, Security } from "@verdaccio/types";

import { plugin, pluginKey } from "@/constants";
import { CONFIG_ENV_NAME_REGEX } from "@/server/constants";
import { ProviderType } from "@/server/plugin/AuthProvider";
import { type FileConfig, type InMemoryConfig, type RedisConfig, StoreType } from "@/server/store/Store";
import { defaultSecurity } from "@verdaccio/config";
import merge from "deepmerge";
import { boolean, mixed, object, Schema, string } from "yup";

import { FileConfigSchema, InMemoryConfigSchema, RedisConfigSchema, RedisStoreConfigHolder } from "./Store";
import { getEnvironmentValue, getStoreFilePath, getTTLValue, handleValidationError } from "./utils";

export interface ConfigHolder {
  authorizationEndpoint?: string;
  authorizedGroups: boolean | string | string[];
  clientId: string;
  clientSecret: string;
  configurationUri?: string;
  getStoreConfig(storeType: StoreType): any;
  groupsClaim?: string;
  groupUsers?: Record<string, string[]>;
  issuer?: string;
  jwksUri?: string;
  keepPasswdLogin: boolean;
  loginButtonText: string;
  packages: PackageList;
  providerHost: string;
  providerType?: ProviderType;
  scope: string;

  secret: string;
  security: Security;
  storeType: StoreType;
  tokenEndpoint?: string;

  urlPrefix: string;
  userinfoEndpoint?: string;

  usernameClaim: string;
}

export interface OpenIDConfig {
  "authorization-endpoint"?: string;
  "authorized-groups"?: boolean | string | string[];
  "client-id"?: string;
  "client-secret"?: string;
  "configuration-uri"?: string;
  "group-users"?: Record<string, string[]> | string;
  "groups-claim"?: string;
  issuer?: string;
  "jwks-uri"?: string;
  "keep-passwd-login"?: boolean;
  "login-button-text"?: string;
  "provider-host": string;
  "provider-type"?: ProviderType;
  scope?: string;
  "store-config"?: Record<string, unknown> | string;
  "store-type"?: StoreType;
  "token-endpoint"?: string;
  "userinfo-endpoint"?: string;
  "username-claim"?: string;
}

export default class ParsedPluginConfig implements ConfigHolder {
  public get authorizationEndpoint() {
    return this.getConfigValue<string | undefined>("authorization-endpoint", string().url().optional());
  }

  public get authorizedGroups() {
    return (
      this.getConfigValue<boolean | string | string[]>(
        "authorized-groups",
        mixed()
          .test({
            message: "must be a string, string[] or a boolean",
            name: "is-string-array-or-boolean",
            skipAbsent: true,
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

  public get clientId() {
    return this.getConfigValue<string>("client-id", string().required());
  }

  public get clientSecret() {
    return this.getConfigValue<string>("client-secret", string().required());
  }

  public get configurationUri() {
    return this.getConfigValue<string | undefined>("configuration-uri", string().url().optional());
  }

  public get groupsClaim() {
    return this.getConfigValue<string | undefined>("groups-claim", string().optional());
  }

  public get groupUsers() {
    return this.getConfigValue<Record<string, string[]> | undefined>(
      "group-users",
      object()
        .test({
          message: "must be a Record<string, string[]>",
          name: "is-record-of-string-arrays",
          skipAbsent: true,
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

  public get issuer() {
    return this.getConfigValue<string | undefined>("issuer", string().url().optional());
  }

  public get jwksUri() {
    return this.getConfigValue<string | undefined>("jwks-uri", string().url().optional());
  }

  public get keepPasswdLogin(): boolean {
    return (
      this.getConfigValue<boolean | undefined>("keep-passwd-login", boolean().optional()) ??
      !!this.verdaccioConfig.auth?.htpasswd?.file
    );
  }

  public get loginButtonText(): string {
    return (
      this.getConfigValue<string | undefined>("login-button-text", string().optional()) ?? "Login with OpenID Connect"
    );
  }

  public get packages(): PackageList {
    return this.verdaccioConfig.packages ?? {};
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

  public get scope() {
    return this.getConfigValue<string | undefined>("scope", string().optional()) ?? "openid";
  }

  public get secret(): string {
    return this.verdaccioConfig.secret;
  }

  public get security(): Security {
    return merge(defaultSecurity, this.verdaccioConfig.security ?? {});
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

  public get tokenEndpoint() {
    return this.getConfigValue<string | undefined>("token-endpoint", string().url().optional());
  }

  public get urlPrefix(): string {
    return this.verdaccioConfig.url_prefix ?? "";
  }

  public get userinfoEndpoint() {
    return this.getConfigValue<string | undefined>("userinfo-endpoint", string().url().optional());
  }

  public get usernameClaim() {
    return this.getConfigValue<string | undefined>("username-claim", string().optional()) ?? "sub";
  }

  constructor(
    private readonly config: OpenIDConfig,
    private readonly verdaccioConfig: Config,
  ) {}

  public getStoreConfig(storeType: StoreType) {
    const configKey: keyof OpenIDConfig = "store-config";

    switch (storeType) {
      case StoreType.File: {
        const config = this.getConfigValue<FileConfig>(
          configKey,
          mixed().test({
            message: "must be a FileConfig or a string",
            name: "is-file-config-or-string",
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

      case StoreType.InMemory: {
        const storeConfig = this.getConfigValue<InMemoryConfig | undefined>(configKey, InMemoryConfigSchema.optional());

        if (storeConfig === undefined) return;

        return { ...storeConfig, ttl: getTTLValue(storeConfig.ttl) } satisfies InMemoryConfig;
      }

      case StoreType.Redis: {
        const storeConfig = this.getConfigValue<RedisConfig | string | undefined>(
          configKey,
          mixed().test({
            message: "must be a RedisConfig or a string",
            name: "is-redis-config-or-redis-url",
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
          password: configHolder.password,
          ttl: getTTLValue(storeConfig.ttl),
          username: configHolder.username,
        } satisfies RedisConfig;
      }

      default: {
        handleValidationError(new Error(`Unsupported store type: ${String(storeType)}`), "store-type");
      }
    }
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
}
