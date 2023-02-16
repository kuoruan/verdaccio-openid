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

import { registerGlobalProxyAgent } from "@/server/proxy-agent";

import { CliFlow, WebFlow } from "../flows";
import logger, { setLogger } from "../logger";
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

    registerGlobalProxyAgent();

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

    logger.debug({ username, token }, "authenticating user, username: @{username}, token: @{token}");

    let user: User;
    try {
      user = await this.core.verifyNpmToken(token);
    } catch (e: any) {
      logger.warn(
        { username, token, message: e.message },
        `invalid token: @{message}, user: "@{username}", token: "@{token}"`
      );

      // the token is not valid by us, let the next auth plugin to handle it
      return callback(null, false);
    }

    if (!!username && username !== user.name) {
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
    logger.debug(
      { username: user.name, groups: user.groups, package: config.name },
      "check access: @{username} (@{groups}) -> @{package}"
    );

    const grant = this.checkPackageAccess(user, config.access);
    if (!grant) {
      logger.info({ username: user.name, package: config.name }, `"@{username}" is not allowed to access "@{package}"`);
    }
    callback(null, grant);
  }

  /**
   * IPluginAuth
   */
  allow_publish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: AuthAccessCallback): void {
    logger.debug(
      { username: user.name, groups: user.groups, package: config.name },
      "check publish: @{username} (@{groups}) -> @{package}"
    );

    const grant = this.checkPackageAccess(user, config.publish || config.access);

    if (!grant) {
      logger.info(
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
    logger.debug(
      { username: user.name, groups: user.groups, package: config.name },
      "check unpublish: @{username} (@{groups}) -> @{package}"
    );

    const grant = this.checkPackageAccess(user, config.unpublish || config.access);

    if (!grant) {
      logger.info(
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
