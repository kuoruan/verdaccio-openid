import { errorUtils } from "@verdaccio/core";
import type {
  AllowAccess,
  AuthAccessCallback,
  AuthCallback,
  IPluginAuth,
  IPluginMiddleware,
  Logger,
  RemoteUser,
} from "@verdaccio/types";
import type { Application } from "express";

import { registerGlobalProxy } from "@/server/proxy-agent";

import { CliFlow, WebFlow } from "../flows";
import logger, { debug, setLogger } from "../logger";
import { OpenIDConnectAuthProvider } from "../openid";
import { AuthCore, type User } from "./AuthCore";
import type { AuthProvider } from "./AuthProvider";
import { type Config, type PackageAccess, ParsedPluginConfig } from "./Config";
import { PatchHtml } from "./PatchHtml";
import { ServeStatic } from "./ServeStatic";

/**
 * Implements the verdaccio plugin interfaces.
 */
export class Plugin implements IPluginMiddleware<any>, IPluginAuth<any> {
  private readonly config: ParsedPluginConfig;
  private readonly provider: AuthProvider;
  private readonly core: AuthCore;

  constructor(config: Config, params: { logger: Logger }) {
    setLogger(params.logger);

    registerGlobalProxy({
      http_proxy: config.http_proxy,
      https_proxy: config.https_proxy,
      no_proxy: config.no_proxy,
    });

    this.config = new ParsedPluginConfig(config);
    this.provider = new OpenIDConnectAuthProvider(this.config);
    this.core = new AuthCore(this.config, this.provider);
  }

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application, auth: any) {
    this.core.setAuth(auth);

    const children = [
      new ServeStatic(),
      new PatchHtml(this.config),
      new WebFlow(this.config, this.core, this.provider),
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
      debug("username or token is empty, skip authentication");

      // set error to null, next auth plugin will be called
      callback(null, false);
      return;
    }

    debug("authenticating user, username: %s, token: %s", username, token);

    let user: User | boolean;
    try {
      user = await this.core.verifyNpmToken(token);
    } catch (e: any) {
      debug(`%s. user: "%s", token: "%s"`, e.message, username, token);

      // the token is not valid by us, let the next auth plugin to handle it
      callback(null, false);
      return;
    }

    /**
     * the result is false, means the token is not authenticated
     */
    if (user === false || user.name === undefined) {
      callback(errorUtils.getForbidden(`User "${username}" are not authenticated.`), false);
      return;
    }

    debug("user: %j", user);

    if (username !== user.name) {
      logger.warn(
        { expected: user.name, actual: username },
        `invalid username: expected "@{expected}", actual "@{actual}"`,
      );

      callback(errorUtils.getForbidden("Invalid username."), false);
      return;
    }

    callback(null, user.realGroups);
  }

  /**
   * IPluginAuth
   */
  allow_access(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    debug("check access: %s (%j) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.access);
    if (!grant) {
      logger.info(
        { username: user.name, package: config.name },
        `user "@{username}" is not allowed to access "@{package}"`,
      );
    }
    callback(null, grant);
  }

  /**
   * IPluginAuth
   */
  allow_publish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    debug("check publish: %s (%j) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.publish || config.access);

    if (!grant) {
      logger.warn(
        { username: user.name, package: config.name },
        `"@{username}" is not allowed to unpublish "@{package}"`,
      );
    }

    callback(null, grant);
  }

  /**
   * IPluginAuth
   */
  allow_unpublish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    debug("check publish: %s (%j) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.unpublish || config.access);

    if (!grant) {
      logger.warn(
        { username: user.name, package: config.name },
        `"@{username}" is not allowed to unpublish "@{package}"`,
      );
    }
    callback(null, grant);
  }

  checkPackageAccess(user: RemoteUser, requiredGroups: string[] | undefined): boolean {
    if (!requiredGroups || requiredGroups.length === 0) {
      return true;
    }

    let groups: string[];
    if (user.name) {
      // check if user is authenticated
      // the authenticated groups may change after user login
      if (this.core.authenticate(user.name, user.real_groups)) {
        groups = this.core.getLoggedUserGroups(user);
      } else {
        logger.warn(
          { username: user.name, groups: JSON.stringify(user.real_groups) },
          `"@{username}" with groups @{groups} is not authenticated for now, use non-authenticated groups instead.`,
        );
        groups = this.core.getNonLoggedUserGroups(user);
      }
    } else {
      // anonymous user
      groups = user.groups;
    }

    debug("user: %o, required groups: %j, actual groups: %j", user.name, requiredGroups, groups);

    return requiredGroups.some((group) => groups.includes(group));
  }
}
