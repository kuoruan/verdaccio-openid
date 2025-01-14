import process from "node:process";

import type { Auth } from "@verdaccio/auth";
import type { pluginUtils } from "@verdaccio/core";
import { errorUtils } from "@verdaccio/core";
import type { AllowAccess, PackageAccess, RemoteUser } from "@verdaccio/types";
import type { Application } from "express";

import { plugin } from "@/constants";
import ParsedPluginConfig, { type OpenIDConfig } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import { CliFlow, WebFlow } from "@/server/flows";
import logger, { setLogger } from "@/server/logger";
import { OpenIDConnectAuthProvider } from "@/server/openid";
import { registerGlobalProxy } from "@/server/proxy-agent";
import { createStore } from "@/server/store";

import { AuthCore, type User } from "./AuthCore";
import type { AuthProvider } from "./AuthProvider";
import { PatchHtml } from "./PatchHtml";
import { ServeStatic } from "./ServeStatic";

export interface PluginMiddleware {
  register_middlewares(app: Application): void;
}

/**
 * Implements the verdaccio plugin interfaces.
 */
export class Plugin
  implements pluginUtils.Auth<AllowAccess & OpenIDConfig>, pluginUtils.ExpressMiddleware<OpenIDConfig, unknown, Auth>
{
  private readonly parsedConfig: ParsedPluginConfig;
  private readonly provider: AuthProvider;
  private readonly core: AuthCore;

  constructor(
    public config: OpenIDConfig,
    public options: pluginUtils.PluginOptions,
  ) {
    setLogger(options.logger);

    const verdaccioConfig = options.config;

    registerGlobalProxy({
      http_proxy: verdaccioConfig.http_proxy,
      https_proxy: verdaccioConfig.https_proxy,
      no_proxy: verdaccioConfig.no_proxy,
    });

    const parsedConfig = new ParsedPluginConfig(config, verdaccioConfig);

    const store = createStore(parsedConfig);

    // close store on process termination
    for (const signal of ["SIGINT", "SIGQUIT", "SIGTERM", "SIGHUP"]) {
      process.once(signal, async () => {
        try {
          debug("Received signal %s, closing store...", signal);

          await store.close();

          debug("Store closed, good bye!");
        } catch (e: any) {
          debug("Error closing store: %s", e.message);
        }
      });
    }

    const provider = new OpenIDConnectAuthProvider(parsedConfig, store);
    const core = new AuthCore(parsedConfig, provider);

    this.parsedConfig = parsedConfig;
    this.provider = provider;
    this.core = core;
  }

  public get version(): number {
    return +plugin.version;
  }

  public getVersion(): number {
    return this.version;
  }

  register_middlewares(app: Application, auth: Auth, _storage: unknown) {
    this.core.setAuth(auth);

    const children = [
      new ServeStatic(),
      new PatchHtml(this.parsedConfig),
      new WebFlow(this.parsedConfig, this.core, this.provider),
      new CliFlow(this.core, this.provider),
    ] satisfies PluginMiddleware[];

    for (const child of children) {
      child.register_middlewares(app);
    }
  }

  async authenticate(username: string, token: string, callback: pluginUtils.AuthCallback): Promise<void> {
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

  allow_access(user: RemoteUser, config: AllowAccess & PackageAccess, callback: pluginUtils.AccessCallback): void {
    debug("check access: %s (%j) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.access);
    if (!grant) {
      logger.debug(
        { username: user.name, package: config.name },
        `user "@{username}" is not allowed to access "@{package}"`,
      );
    }
    callback(null, grant);
  }

  allow_publish(user: RemoteUser, config: AllowAccess & PackageAccess, callback: pluginUtils.AuthAccessCallback): void {
    debug("check publish: %s (%j) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.publish ?? config.access);

    if (!grant) {
      logger.warn(
        { username: user.name, package: config.name },
        `"@{username}" is not allowed to unpublish "@{package}"`,
      );
    }

    callback(null, grant);
  }

  allow_unpublish(
    user: RemoteUser,
    config: AllowAccess & PackageAccess,
    callback: pluginUtils.AuthAccessCallback,
  ): void {
    debug("check publish: %s (%j) -> %s", user.name, user.real_groups, config.name);

    const grant = this.checkPackageAccess(user, config.unpublish ?? config.access);

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
