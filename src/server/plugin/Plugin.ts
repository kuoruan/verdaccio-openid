import { errorUtils } from "@verdaccio/core";

import logger, { setLogger } from "@/logger";

import { CliFlow, WebFlow } from "../flows";
import { OpenIDConnectAuthProvider } from "../oidc";
import { AuthCore } from "./AuthCore";
import { Cache } from "./Cache";
import { Config, PackageAccess, ParsedPluginConfig } from "./Config";
import { PatchHtml } from "./PatchHtml";
import { registerGlobalProxyAgent } from "./ProxyAgent";
import { ServeStatic } from "./ServeStatic";
import { Auth, Verdaccio } from "./Verdaccio";

import type {
  AllowAccess,
  AuthAccessCallback,
  AuthCallback,
  IPluginAuth,
  IPluginMiddleware,
  RemoteUser,
  Logger,
} from "@verdaccio/types";
import type { Application } from "express";

/**
 * Implements the verdaccio plugin interfaces.
 */
export class Plugin implements IPluginMiddleware<any>, IPluginAuth<any> {
  private readonly parsedConfig: ParsedPluginConfig;
  private readonly provider: OpenIDConnectAuthProvider;
  private readonly cache: Cache;
  private readonly verdaccio: Verdaccio;
  private readonly core: AuthCore;

  constructor(private readonly config: Config, { logger }: { logger: Logger }) {
    setLogger(logger);

    registerGlobalProxyAgent();

    this.parsedConfig = new ParsedPluginConfig(this.config);
    this.provider = new OpenIDConnectAuthProvider(this.parsedConfig);
    this.cache = new Cache(this.provider.getId());
    this.verdaccio = new Verdaccio(this.config, this.cache);
    this.core = new AuthCore(this.verdaccio, this.parsedConfig);
  }

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application, auth: Auth) {
    this.verdaccio.setAuth(auth);

    const children = [
      new ServeStatic(),
      new PatchHtml(),
      new WebFlow(this.parsedConfig, this.core, this.provider),
      new CliFlow(this.verdaccio, this.core, this.provider),
    ];

    for (const child of children) {
      child.register_middlewares(app);
    }
  }

  /**
   * IPluginAuth
   */
  async authenticate(username: string, token: string, callback: AuthCallback): Promise<void> {
    if (!username || !token) {
      callback(errorUtils.getForbidden("username and token is required"), false);
      return;
    }

    let groups = this.cache.getGroups(username);
    if (!groups) {
      const providerToken = this.cache.getProviderToken(token);

      if (!providerToken) {
        return callback(errorUtils.getForbidden("invalid token"), false);
      }

      try {
        groups = await this.provider.getGroups(username, providerToken);
      } catch (e: any) {
        callback(errorUtils.getForbidden(e.message), false);
        return;
      }
    }

    if (groups) {
      this.cache.setGroups(token, groups);

      if (this.core.authenticate(username, groups)) {
        const user = this.core.createAuthenticatedUser(username, groups);

        callback(null, user.real_groups);
      } else {
        callback(errorUtils.getForbidden("user groups are not authenticated"), false);
      }
    } else {
      callback(errorUtils.getForbidden("empty user groups"), false);
    }
  }

  /**
   * IPluginAuth
   */
  allow_access(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    logger.info({ username: user.name, package: config.name }, "@{username} is trying to access @{package}");

    if (config.access) {
      const grant = config.access.some((group) => user.groups.includes(group));
      callback(null, grant);
    } else {
      callback(null, true);
    }
  }

  /**
   * IPluginAuth
   */
  allow_publish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    logger.info({ username: user.name, package: config.name }, "@{username} is trying to publish @{package}");

    if (config.publish) {
      const grant = config.publish.some((group) => user.groups.includes(group));
      callback(null, grant);
    } else {
      this.allow_access(user, config, callback);
    }
  }

  /**
   * IPluginAuth
   */
  allow_unpublish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    logger.info({ username: user.name, package: config.name }, "@{username} is trying to unpublish @{package}");

    if (config.unpublish) {
      const grant = config.unpublish.some((group) => user.groups.includes(group));
      callback(null, grant);
    } else {
      this.allow_publish(user, config, callback);
    }
  }
}
