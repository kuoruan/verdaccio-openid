import process from "node:process";

import { defaultSecurity } from "@verdaccio/config";
import type {
  Config as IncorrectVerdaccioConfig,
  PackageAccess as IncorrectVerdaccioPackageAccess,
  Security,
} from "@verdaccio/types";
import merge from "deepmerge";
import { array, lazy, mixed, object, Schema, string } from "yup";

import { pluginKey } from "@/constants";
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
  "authorized-group"?: string | false;
  "group-users"?: Record<string, string[]>;
}

export interface Config extends VerdaccioConfig {
  middlewares: { [key: string]: PluginConfig };
  auth: { [key: string]: PluginConfig };
}

function getEnvironmentValue(name: any) {
  const value = process.env[String(name)];
  if (value === "true" || value === "false") {
    return value === "true";
  }
  return value;
}

function getConfigValue<T>(config: Config, key: string, schema: Pick<Schema, "validateSync">): T {
  const valueOrEnvironmentName = config.auth?.[pluginKey]?.[key] ?? config.middlewares?.[pluginKey]?.[key];

  const value = getEnvironmentValue(valueOrEnvironmentName) ?? valueOrEnvironmentName;

  try {
    schema.validateSync(value);
  } catch (error: any) {
    let message: string;

    // eslint-disable-next-line unicorn/prefer-ternary
    if (error.errors) {
      // ValidationError
      message = error.errors[0];
    } else {
      message = error.message || error;
    }

    logger.error(
      { pluginKey, key, message },
      'invalid configuration at "auth.@{pluginKey}.@{key}": @{message} — Please check your verdaccio config.',
    );

    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }

  return value as T;
}

export class ParsedPluginConfig {
  constructor(public readonly config: Config) {
    for (const node of ["middlewares", "auth"]) {
      const object_ = config[node]?.[pluginKey];

      if (!object_) {
        throw new Error(`"${node}.${pluginKey}" must be enabled`);
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
  public get urlPrefix() {
    return this.config.url_prefix ?? "";
  }

  public get providerHost() {
    return getConfigValue<string>(this.config, "provider-host", string().required());
  }

  public get providerType() {
    return getConfigValue<ProviderType | undefined>(this.config, "provider-type", mixed().oneOf(["gitlab"]).optional());
  }

  public get configurationUri() {
    return getConfigValue<string | undefined>(this.config, "configuration-uri", string().url().optional());
  }

  public get issuer() {
    return getConfigValue<string | undefined>(this.config, "issuer", string().url().optional());
  }

  public get authorizationEndpoint() {
    return getConfigValue<string | undefined>(this.config, "authorization-endpoint", string().url().optional());
  }

  public get tokenEndpoint() {
    return getConfigValue<string | undefined>(this.config, "token-endpoint", string().url().optional());
  }

  public get userinfoEndpoint() {
    return getConfigValue<string | undefined>(this.config, "userinfo-endpoint", string().url().optional());
  }

  public get jwksUri() {
    return getConfigValue<string | undefined>(this.config, "jwks-uri", string().url().optional());
  }

  public get scope() {
    return getConfigValue<string | undefined>(this.config, "scope", string().optional()) ?? "openid";
  }

  public get clientId() {
    const envClientId = process.env.VERDACCIO_OPENID_CLIENT_ID;

    const schema: Schema = string();
    return (
      getConfigValue<string>(this.config, "client-id", envClientId ? schema.optional() : schema.required()) ??
      envClientId
    );
  }

  public get clientSecret() {
    const envClientSecret = process.env.VERDACCIO_OPENID_CLIENT_SECRET;

    const schema: Schema = string();

    return (
      getConfigValue<string>(this.config, "client-secret", envClientSecret ? schema.optional() : schema.required()) ??
      envClientSecret
    );
  }

  public get usernameClaim() {
    return getConfigValue<string | undefined>(this.config, "username-claim", string().optional()) ?? "sub";
  }

  public get groupsClaim() {
    return getConfigValue<string | undefined>(this.config, "groups-claim", string().optional());
  }

  public get authorizedGroups() {
    return getConfigValue<unknown>(this.config, "authorized-groups", mixed().optional()) ?? false;
  }

  public get groupUsers() {
    return getConfigValue<Record<string, string[]> | undefined>(
      this.config,
      "group-users",
      lazy((value) => {
        switch (typeof value) {
          case "object": {
            return object(
              Object.fromEntries(Object.keys(value).map((key) => [key, array(string()).compact().min(1).required()])),
            ).optional();
          }
          default: {
            return object().optional();
          }
        }
      }),
    );
  }
}
