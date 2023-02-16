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
import { AuthCore, User } from "./AuthCore";
import { Config, PackageAccess, ParsedPluginConfig } from "./Config";
import { PatchHtml } from "./PatchHtml";
import { ServeStatic } from "./ServeStatic";

/**
 * Implements the verdaccio plugin interfaces.
 */
export class Plugin implements IPluginMiddleware<any>, IPluginAuth<any> {
  private readonly parsedConfig: ParsedPluginConfig;
  private readonly provider: OpenIDConnectAuthProvider;
  private readonly core: AuthCore;

  constructor(private readonly config: Config, params: { logger: Logger }) {
    setLogger(params.logger);

    registerGlobalProxy({
      http_proxy: config.http_proxy,
      https_proxy: config.https_proxy,
      no_proxy: config.no_proxy,
    });

    this.parsedConfig = new ParsedPluginConfig(this.config);
    this.provider = new OpenIDConnectAuthProvider(this.parsedConfig);
    this.core = new AuthCore(this.parsedConfig, this.provider);
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
      // set error to null, next auth plugin will be called
      return callback(null, false);
    }

    debug("authenticating user, username: %s, token: %s", username, token);

    let user: User;
    try {
      user = await this.core.verifyNpmToken(token);

      debug("user: %o", user);
    } catch (e: any) {
      debug(`%s. user: "%s", token: "%s"`, e.message, username, token);

      // the token is not valid by us, let the next auth plugin to handle it
      return callback(null, false);
    }

    if (!user.name) {
      debug(`invalid token: %s. user: "%s"`, token, username);
      return callback(null, false);
    }

    if (username !== user.name) {
      logger.warn(
        { expected: user.name, actual: username },
        `invalid username: expected "@{expected}", actual "@{actual}"`
      );

      return callback(errorUtils.getForbidden("Invalid username."), false);
    }

    let groups: string[] | undefined;
    if (Array.isArray(user.real_groups)) {
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

    if (this.core.authenticate(username, groups)) {
      return callback(null, groups || []);
    } else {
      return callback(errorUtils.getForbidden(`User "${username}" are not authenticated.`), false);
    }
  }

  /**
   * IPluginAuth
   */
  allow_access(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    debug("check access: %s (%o) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.access);
    if (!grant) {
      debug(`"%s" is not allowed to access "%s"`, user.name, config.name);
    }
    callback(null, grant);
  }

  /**
   * IPluginAuth
   */
  allow_publish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    debug("check publish: %s (%o) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.publish || config.access);

    if (!grant) {
      logger.warn(
        { username: user.name, package: config.name },
        `"@{username}" is not allowed to unpublish "@{package}"`
      );
    }

    callback(null, grant);
  }

  /**
   * IPluginAuth
   */
  allow_unpublish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    debug("check publish: %s (%o) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.unpublish || config.access);

    if (!grant) {
      logger.warn(
        { username: user.name, package: config.name },
        `"@{username}" is not allowed to unpublish "@{package}"`
      );
    }
    callback(null, grant);
  }

  checkPackageAccess(user: RemoteUser, requiredGroups: string[] | undefined): boolean {
    if (!requiredGroups || requiredGroups.length === 0) {
      return true;
    }

    let userGroups: string[];

    // check if user is authenticated
    if (this.core.authenticate(user.name, user.real_groups)) {
      const authUser = this.core.createAuthenticatedUser(user.name as string, user.real_groups);
      userGroups = authUser.groups;
    } else {
      // usually, user groups is empty with our jwt
      // but with lagacy token, user groups is not empty
      if (user.groups && user.groups.length > 0) {
        userGroups = user.groups;
      } else {
        const unauthUser = this.core.createAnonymousUser();
        userGroups = unauthUser.groups;
      }
    }
    return requiredGroups.some((group) => userGroups.includes(group));
  }
}
