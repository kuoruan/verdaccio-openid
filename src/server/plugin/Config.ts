import process from "node:process";

import { defaultSecurity } from "@verdaccio/config";
import type {
  Config as IncorrectVerdaccioConfig,
  PackageAccess as IncorrectVerdaccioPackageAccess,
  Security,
} from "@verdaccio/types";
import merge from "deepmerge";
import { mixed, object, Schema, string } from "yup";

import { plugin, pluginKey } from "@/constants";
import logger from "@/server/logger";

// Verdaccio incorrectly types some of these as string arrays
// although they are all strings.
export type PackageAccess = IncorrectVerdaccioPackageAccess & {
  unpublish?: string[];
};

export type VerdaccioConfig = IncorrectVerdaccioConfig & {
  packages?: Record<string, PackageAccess>;
  security?: Partial<Security>;
};

type ProviderType = "gitlab";

export interface PluginConfig {
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

export interface OpenIdConfig {
  middlewares: Record<"openid", PluginConfig>;
  auth: Record<"openid", PluginConfig>;
}

export type Config = OpenIdConfig & VerdaccioConfig;

export interface ConfigHolder {
  providerHost: string;
  providerType?: string;
  issuer?: string;
  configurationUri?: string;
  scope: string;
  usernameClaim: string;
  groupsClaim?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  clientId: string;
  clientSecret: string;
  urlPrefix: string;
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

function getOpenIdConfigValue<T>(config: OpenIdConfig, key: keyof PluginConfig, schema: Schema): T {
  const valueOrEnvironmentName = config.auth?.[pluginKey]?.[key] ?? config.middlewares?.[pluginKey]?.[key];

  /**
   * If the value is not defined in the config, use the plugin name and key as the environment variable name.
   *
   * eg. client-id -> `VERDACCIO_OPENID_CLIENT_ID`
   */
  const environmentName: string =
    typeof valueOrEnvironmentName === "string" && !!valueOrEnvironmentName
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

export class ParsedPluginConfig implements ConfigHolder {
  constructor(public readonly config: Config) {
    for (const node of ["middlewares", "auth"] satisfies (keyof OpenIdConfig)[]) {
      const object_ = config[node]?.[pluginKey];

      if (!object_) {
        throw new Error(`"${node}.${pluginKey}" must be defined in the verdaccio config.`);
      }
    }
  }

  public get secret() {
    return this.config.secret;
  }

  public get security(): Security {
    return merge(defaultSecurity, this.config.security || {});
  }

  public get packages() {
    return this.config.packages ?? {};
  }
  public get urlPrefix(): string {
    return this.config.url_prefix ?? "";
  }

  private getConfigValue<T>(key: keyof PluginConfig, schema: Schema): T {
    return getOpenIdConfigValue<T>(this.config, key, schema);
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
      this.getConfigValue<unknown>(
        "authorized-groups",
        mixed()
          .test({
            name: "is-string-array-or-boolean",
            skipAbsent: true,
            message: "must be a string[] or a boolean",
            test: (value) => {
              if (Array.isArray(value)) {
                return value.every((item) => typeof item === "string");
              }
              return typeof value === "boolean";
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
