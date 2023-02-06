import process from "process";

import merge from "deepmerge";
import { object, string, mixed, array, AnySchema, lazy } from "yup";

import { pluginKey } from "@/constants";

import logger from "../logger";

import type {
  Config as IncorrectVerdaccioConfig,
  PackageAccess as IncorrectVerdaccioPackageAccess,
  Security,
} from "@verdaccio/types";

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
  "client-id": string;
  "client-secret": string;
  "username-claim"?: string;
  "groups-claim"?: string;
  "authorized-group"?: string | false;
  "group-users"?: Record<string, string[]>;
}

export interface Config extends VerdaccioConfig {
  middlewares: { [key: string]: PluginConfig };
  auth: { [key: string]: PluginConfig };
}

// https://github.com/verdaccio/verdaccio/blob/master/packages/config/src/security.ts
const TIME_EXPIRATION_7D = "7d";

const defaultSecurity = {
  api: {
    legacy: true,
  },
  web: {
    sign: {
      expiresIn: TIME_EXPIRATION_7D,
    },
    verify: {},
  },
};

function getEnvValue(name: any) {
  const value = process.env[String(name)];
  if (value === "true" || value === "false") {
    return value === "true";
  }
  return value;
}

function getConfigValue<T>(config: Config, key: string, schema: AnySchema | ReturnType<typeof lazy>): T {
  const valueOrEnvName = config.auth?.[pluginKey]?.[key] ?? config.middlewares?.[pluginKey]?.[key];

  const value = getEnvValue(valueOrEnvName) ?? valueOrEnvName;

  try {
    schema.validateSync(value);
  } catch (e: any) {
    let message: string;

    if (e.errors) {
      // ValidationError
      message = e.errors[0];
    } else {
      message = e.message || e;
    }

    logger.error(
      { pluginKey, key, message },
      'Invalid configuration at "auth.@{pluginKey}.@{key}": @{message} — Please check your verdaccio config.'
    );
    process.exit(1);
  }

  return value as T;
}

export class ParsedPluginConfig {
  constructor(public readonly config: Config) {
    for (const node of ["middlewares", "auth"]) {
      const obj = config[node]?.[pluginKey];

      if (!obj) {
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
    return getConfigValue<string | undefined>(this.config, "scope", string().optional());
  }

  public get clientId() {
    return getConfigValue<string>(this.config, "client-id", string().required());
  }

  public get clientSecret() {
    return getConfigValue<string>(this.config, "client-secret", string().required());
  }

  public get usernameClaim() {
    return getConfigValue<string | undefined>(this.config, "username-claim", string().optional()) ?? "sub";
  }

  public get groupsClaim() {
    return getConfigValue<string | undefined>(this.config, "groups-claim", string().optional());
  }

  public get authorizedGroup() {
    return (
      getConfigValue<string | false | undefined>(
        this.config,
        "authorized-group",
        mixed().oneOf([string(), false]).optional()
      ) ?? false
    );
  }

  public get groupUsers() {
    return getConfigValue<Record<string, string[]> | undefined>(
      this.config,
      "group-users",
      lazy((val) => {
        switch (typeof val) {
          case "object":
            return object(
              Object.fromEntries(Object.keys(val).map((key) => [key, array().of(string()).min(1).required()]))
            ).optional();
          default:
            return object().optional();
        }
      })
    );
  }
}
