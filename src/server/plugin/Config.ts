import process from "process";

import assert from "ow";

import { pluginKey } from "@/constants";
import logger from "@/logger";

import type {
  Config as IncorrectVerdaccioConfig,
  PackageAccess as IncorrectVerdaccioPackageAccess,
  Security,
} from "@verdaccio/types";

//
// Types
//

// Verdaccio incorrectly types some of these as string arrays
// although they are all strings.
export type PackageAccess = Partial<IncorrectVerdaccioPackageAccess>;

export type VerdaccioConfig = IncorrectVerdaccioConfig & {
  packages?: Record<string, PackageAccess>;
  security?: Partial<Security>;
};

type ProviderType = "gitlab" | "universal";

export interface PluginConfig {
  host: string;
  "configuration-endpoint"?: string;
  issuer?: string;
  "authorization-endpoint"?: string;
  "userinfo-endpoint"?: string;
  "token-endpoint"?: string;
  "jwks-uri"?: string;
  scope?: string;
  "client-id": string;
  "client-secret": string;
  "username-claim": string;
  "groups-claim"?: string;
  "authorized-group": string | false;
  "group-users"?: Record<string, string[]>;
  "provider-type"?: ProviderType;
}

export interface Config extends VerdaccioConfig {
  middlewares: { [key: string]: PluginConfig };
  auth: { [key: string]: PluginConfig };
}

//
// Validation
//
function validatePluginEnabled(config: Config, node: keyof Config) {
  const obj = config.node?.[pluginKey];

  if (!obj) {
    throw new Error(`"${node}.${pluginKey}" must be enabled`);
  }
}

function getEnvValue(name: any) {
  const value = process.env[String(name)];
  if (value === "true" || value === "false") {
    return value === "true";
  }
  return value;
}

function getConfigValue<T>(config: Config, key: string, predicate: any): T {
  const valueOrEnvName = config.auth?.[pluginKey]?.[key] ?? config.middlewares?.[pluginKey]?.[key];

  const value = getEnvValue(valueOrEnvName) ?? valueOrEnvName;

  try {
    assert(value, predicate);
  } catch (error: any) {
    logger.error(
      { pluginKey, key, message: error.message },
      'Invalid configuration at "auth.@{pluginKey}.@{key}": @{error.message} — Please check your verdaccio config.'
    );
    process.exit(1);
  }

  return value as T;
}

export class ParsedPluginConfig {
  public get packages() {
    return this.config.packages ?? {};
  }
  public get url_prefix() {
    return this.config.url_prefix ?? "";
  }

  public get host() {
    return getConfigValue<string>(this.config, "host", assert.string.nonEmpty);
  }

  public get configurationEndpoint() {
    return getConfigValue<string | undefined>(this.config, "configuration-endpoint", assert.optional.string.nonEmpty);
  }

  public get issuer() {
    return getConfigValue<string | undefined>(this.config, "issuer", assert.optional.string.nonEmpty);
  }

  public get authorizationEndpoint() {
    return getConfigValue<string | undefined>(this.config, "authorization-endpoint", assert.optional.string.nonEmpty);
  }

  public get tokenEndpoint() {
    return getConfigValue<string | undefined>(this.config, "token-endpoint", assert.optional.string.nonEmpty);
  }

  public get userinfoEndpoint() {
    return getConfigValue<string | undefined>(this.config, "userinfo-endpoint", assert.optional.string.nonEmpty);
  }

  public get jwksUri() {
    return getConfigValue<string | undefined>(this.config, "jwks-uri", assert.optional.string.nonEmpty);
  }

  public get scope() {
    return getConfigValue<string | undefined>(this.config, "scope", assert.optional.string.nonEmpty);
  }

  public get clientId() {
    return getConfigValue<string>(this.config, "client-id", assert.string.nonEmpty);
  }

  public get clientSecret() {
    return getConfigValue<string>(this.config, "client-secret", assert.string.nonEmpty);
  }

  public get usernameClaim() {
    return getConfigValue<string | undefined>(this.config, "username-claim", assert.optional.string.nonEmpty) ?? "sub";
  }

  public get authorizedGroup() {
    return (
      getConfigValue<string | false | undefined>(
        this.config,
        "authorized-group",
        assert.any(assert.optional.string.nonEmpty, assert.optional.boolean.false)
      ) ?? false
    );
  }

  public get groupsClaim() {
    return getConfigValue<string | undefined>(this.config, "groups-claim", assert.optional.string.nonEmpty);
  }

  public get groupUsers() {
    return getConfigValue<Record<string, string[]> | undefined>(
      this.config,
      "group-users",
      assert.optional.map
        .keysOfType(assert.string.nonEmpty)
        .valuesOfType(assert.array.ofType(assert.string.nonEmpty).minLength(1))
        .minSize(1)
    );
  }

  public get providerType() {
    return (
      getConfigValue<ProviderType | undefined>(
        this.config,
        "provider-type",
        assert.optional.string.oneOf(["gitlab"])
      ) ?? "universal"
    );
  }

  constructor(public readonly config: Config) {
    validatePluginEnabled(config, "middlewares");
    validatePluginEnabled(config, "auth");
  }
}
