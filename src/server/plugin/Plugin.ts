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
    this.cache = new Cache(this.provider);
    this.verdaccio = new Verdaccio(this.config);
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
    try {
      if (!username || !token) {
        callback(null, false);
        return;
      }

      const groups = await this.cache.getGroups(token);

      if (groups && this.core.authenticate(username, groups)) {
        const user = await this.core.createAuthenticatedUser(username, groups);

        callback(null, user.real_groups);
        return;
      }

      callback(null, false);
    } catch (error: any) {
      callback(error, false);
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
