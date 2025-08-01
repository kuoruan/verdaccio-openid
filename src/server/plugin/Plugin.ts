import process from "node:process";

import type { ActionsAllowed, AllowAction, AllowActionCallback, Auth } from "@verdaccio/auth";
import type { pluginUtils } from "@verdaccio/core";
import { errorUtils } from "@verdaccio/core";
import type { AllowAccess, AuthPackageAllow, RemoteUser } from "@verdaccio/types";
import type { Application } from "express";

import { plugin } from "@/constants";
import ParsedPluginConfig, { type OpenIDConfig } from "@/server/config/Config";
import { debug } from "@/server/debugger";
import { CliFlow, WebFlow } from "@/server/flows";
import logger, { setLogger } from "@/server/logger";
import { OpenIDConnectAuthProvider } from "@/server/openid";
import { registerGlobalProxy } from "@/server/proxy-agent";
import { createStore } from "@/server/store";
import type { Store } from "@/server/store/Store";

import { WebAuthFlow } from "../flows/WebAuthFlow";
import { AuthCore } from "./AuthCore";
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
  implements pluginUtils.Auth<AllowAccess & OpenIDConfig>, pluginUtils.ExpressMiddleware<OpenIDConfig, never, Auth>
{
  private readonly parsedConfig: ParsedPluginConfig;
  private readonly provider: AuthProvider;
  private readonly core: AuthCore;
  private readonly store: Store;

  private storeClosing = false;

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
        if (this.storeClosing) return;
        this.storeClosing = true;

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
    this.store = store;
  }

  public get version(): number {
    return +plugin.version;
  }

  public getVersion(): number {
    return this.version;
  }

  register_middlewares(app: Application, auth: Auth, _storage: never) {
    this.core.setAuth(auth);

    const children = [
      new ServeStatic(),
      new PatchHtml(this.parsedConfig),
      new WebFlow(this.parsedConfig, this.core, this.provider),
      new CliFlow(this.parsedConfig, this.core, this.provider),
      new WebAuthFlow(this.parsedConfig, this.core, this.provider, this.store),
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

    let user: Omit<RemoteUser, "groups"> | boolean;
    try {
      user = await this.core.verifyNpmToken(token);
    } catch (e: any) {
      debug(`%s. user: "%s", token: "%s", falling back to legacy auth`, e.message, username, token);

      // the token is not valid by us, let the next auth plugin to handle it
      callback(null, false);
      return;
    }

    /**
     * the result is false, means the token is not authenticated
     */
    if (user === false || !user.name) {
      callback(errorUtils.getUnauthorized(`user ${username} is not authenticated`), false);
      return;
    }

    debug("user: %j", user);

    if (username !== user.name) {
      logger.warn(
        { expected: user.name, actual: username },
        `invalid username: expected "@{expected}", actual "@{actual}"`,
      );

      callback(errorUtils.getUnauthorized("invalid username"), false);
      return;
    }

    callback(null, user.real_groups);
  }

  allow_access = this.allow_action("access");
  allow_publish = this.allow_action("publish");
  allow_unpublish = this.allow_action(["unpublish", "publish"]);

  allow_action(action: ActionsAllowed | ActionsAllowed[]): AllowAction {
    const actions = Array.isArray(action) ? action : [action];

    const mainAction = actions[0];

    return (user: RemoteUser, pkg: AuthPackageAllow, callback: AllowActionCallback): void => {
      let requiredGroups: string[] | undefined;

      for (const action of actions) {
        const groups = pkg[action];
        if (groups) {
          requiredGroups = groups;
          break;
        }
      }

      if (!requiredGroups?.length || !user.name) {
        // let next auth plugin to handle it
        callback(null, false);
        return;
      }

      debug("check %s: %s (%j) -> %s, required: %j", mainAction, user.name, user.real_groups, pkg.name, requiredGroups);

      let userGroups: string[];
      /**
       * Check if user is authenticated
       * The authenticated groups may change after user login.
       * If the user is authenticated, we use the logged user groups.
       * If the user is not authenticated, we use the non-logged user groups.
       * This is to ensure that the user has the correct groups to access the package.
       */
      if (this.core.authenticate(user.name, user.real_groups)) {
        userGroups = this.core.getLoggedUserGroups(user);
      } else {
        logger.info(
          { user: user.name, groups: JSON.stringify(user.real_groups) },
          `User "@{user}" with groups @{groups} is not authenticated now, treating as non-logged user`,
        );
        userGroups = this.core.getNonLoggedUserGroups();
      }

      const hasPermission = requiredGroups.some((group) => user.name === group || userGroups.includes(group));

      if (hasPermission) {
        callback(null, true);
        return;
      }

      callback(errorUtils.getForbidden(`user ${user.name} is not allowed to ${mainAction} package ${pkg.name}`));
    };
  }
}
