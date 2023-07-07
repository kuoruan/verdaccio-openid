import { errorUtils } from "@verdaccio/core";

import { registerGlobalProxyAgent } from "@/server/proxy-agent";

import { AuthCore, UserWithToken } from "./AuthCore";
import { Config, PackageAccess, ParsedPluginConfig } from "./Config";
import { PatchHtml } from "./PatchHtml";
import { ServeStatic } from "./ServeStatic";
import { CliFlow, WebFlow } from "../flows";
import logger, { setLogger } from "../logger";
import { OpenIDConnectAuthProvider } from "../openid";

import type {
  AuthAccessCallback,
  AuthCallback,
  IPluginAuth,
  IPluginMiddleware,
  AllowAccess,
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
  private readonly core: AuthCore;

  constructor(private readonly config: Config, params: { logger: Logger }) {
    setLogger(params.logger);

    registerGlobalProxyAgent();

    this.parsedConfig = new ParsedPluginConfig(this.config);
    this.provider = new OpenIDConnectAuthProvider(this.parsedConfig);
    this.core = new AuthCore(this.parsedConfig);
  }

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application, auth: any) {
    this.core.setAuth(auth);

    const children = [
      new ServeStatic(),
      new PatchHtml(),
      new WebFlow(this.core, this.provider),
      new CliFlow(this.core, this.provider),
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
      return callback(errorUtils.getForbidden("Username and token are required."), false);
    }

    let user: UserWithToken;
    try {
      user = this.core.verifyNpmToken(token);
    } catch (e: any) {
      logger.warn(
        { username, token, message: e.message },
        `invalid token: @{message}, user: "@{username}", token: "@{token}"`
      );

      return callback(errorUtils.getForbidden("Invalid token."), false);
    }

    if (username !== user.name) {
      logger.warn(
        { expected: user.name, actual: username },
        `invalid username: expected "@{expected}", actual "@{actual}"`
      );

      return callback(errorUtils.getForbidden("Invalid username."), false);
    }

    let groups: string[] | undefined;
    if (!user.legacyToken && Array.isArray(user.real_groups)) {
      groups = user.real_groups;
    }

    if (!groups) {
      groups = this.core.getUserGroups(username);
    }

    if (!groups && user.token) {
      try {
        groups = await this.provider.getGroups(user.token);
      } catch (e: any) {
        return callback(errorUtils.getForbidden(e.message), false);
      }
    }

    if (groups) {
      if (this.core.authenticate(username, groups)) {
        return callback(null, groups);
      } else {
        return callback(errorUtils.getForbidden("User groups are not authenticated."), false);
      }
    } else {
      return callback(errorUtils.getForbidden("Empty user groups."), false);
    }
  }

  /**
   * IPluginAuth
   */
  allow_access(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    const grant = !config.access || config.access.some((group) => user.groups.includes(group));
    if (!grant) {
      logger.info({ username: user.name, package: config.name }, `"@{username}" is not allowed to access "@{package}"`);
    }
    callback(null, grant);
  }

  /**
   * IPluginAuth
   */
  allow_publish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    if (config.publish) {
      const grant = config.publish.some((group) => user.groups.includes(group));
      if (!grant) {
        logger.info(
          { username: user.name, package: config.name },
          `"@{username}" is not allowed to publish "@{package}"`
        );
      }
      callback(null, grant);
    } else {
      this.allow_access(user, config, callback);
    }
  }

  /**
   * IPluginAuth
   */
  allow_unpublish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    if (config.unpublish) {
      const grant = config.unpublish.some((group) => user.groups.includes(group));
      if (!grant) {
        logger.info(
          { username: user.name, package: config.name },
          `"@{username}" is not allowed to unpublish "@{package}"`
        );
      }
      callback(null, grant);
    } else {
      this.allow_publish(user, config, callback);
    }
  }
}
