import process from "node:process";

import { defaultSecurity } from "@verdaccio/config";
import type { Config, PackageAccess as IncorrectPackageAccess, PackageList, Security } from "@verdaccio/types";
import merge from "deepmerge";
import { mixed, object, Schema, string } from "yup";

import { plugin, pluginKey } from "@/constants";
import { CONFIG_ENV_NAME_REGEX } from "@/server/constants";
import logger from "@/server/logger";

type ProviderType = "gitlab";

export interface PackageAccess extends IncorrectPackageAccess {
  unpublish?: string[];
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
  "authorized-groups"?: string | string[] | boolean;
  "group-users"?: string | Record<string, string[]>;
}

export interface ConfigHolder {
  providerHost: string;
  providerType?: string;
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

  urlPrefix: string;
  secret: string;
  security: Security;
  packages: Record<string, PackageAccess>;
}

/**
 * Get the value of an environment variable.
 *
 * @param name - The name of the environment variable.
 * @returns
 */
function getEnvironmentValue(name: string): unknown {
  const value = process.env[name];

  if (value === undefined || value === null) return value;

  if (value === "true" || value === "false") {
    return value === "true";
  }

  try {
    const v = JSON.parse(value);

    // Only return the parsed value if it is an object.
    if (typeof v === "object" && v !== null) {
      return v;
    }
  } catch {
    // Do nothing
  }

  return value;
}

function handleValidationError(error: any, key: string) {
  const message = error.errors ? error.errors[0] : error.message || error;
  logger.error(
    { pluginKey, key, message },
    `invalid configuration at "auth.@{pluginKey}.@{key}": @{message} — Please check your verdaccio config.`,
  );
  process.exit(1);
}

export class ParsedPluginConfig implements ConfigHolder {
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
        .oneOf(["gitlab"] satisfies ProviderType[])
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
}
