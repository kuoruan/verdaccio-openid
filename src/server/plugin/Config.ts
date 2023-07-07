import process from "process";

import get from "lodash/get";
import assert from "ow";
import { PartialDeep, RemoveIndexSignature } from "type-fest";
import pkg from "verdaccio/package.json";

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
export interface PackageAccess extends IncorrectVerdaccioPackageAccess {
  unpublish?: string[];
}

export type VerdaccioConfig = Omit<RemoveIndexSignature<IncorrectVerdaccioConfig>, "packages" | "security"> & {
  packages?: Record<string, PackageAccess>;
  security?: PartialDeep<Security>;
};

type ProviderType = "gitlab";

export interface PluginConfig {
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

/**
 * e.g. "5.0.4"
 */
export function getVersion(): string {
  return pkg.version;
}

//
// Validation
//

function validateVersion() {
  const version = getVersion();

  if (version < "5") {
    throw new Error("This plugin requires verdaccio 5 or above");
  }
}

function validateNodeExists(config: Config, node: keyof Config) {
  const path = `[${node}][${pluginKey}]`;
  const obj = get(config, path, {});

  if (!Object.keys(obj).length) {
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
  const valueOrEnvName = get(config, ["auth", pluginKey, key]) ?? get(config, ["middlewares", pluginKey, key]);

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

//
// Access
//
export class ParsedPluginConfig {
  public get packages() {
    return this.config.packages ?? {};
  }
  public get url_prefix() {
    return this.config.url_prefix ?? "";
  }

  public get authorizedGroup() {
    return (
      getConfigValue<string | false>(
        this.config,
        "authorized-group",
        assert.any(assert.string.nonEmpty, assert.boolean.false)
      ) ?? false
    );
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
    return getConfigValue<string>(this.config, "username-claim", assert.string.nonEmpty);
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
        .valuesOfType(assert.array.ofType(assert.string.nonEmpty).maxLength(1))
        .maxSize(1)
    );
  }

  public get providerType() {
    return getConfigValue<ProviderType | undefined>(
      this.config,
      "provider-type",
      assert.optional.string.oneOf(["gitlab"])
    );
  }

  constructor(public readonly config: Config) {
    validateVersion();

    validateNodeExists(config, "middlewares");
    validateNodeExists(config, "auth");
  }
}
