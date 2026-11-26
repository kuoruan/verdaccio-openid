import process from "node:process";

import type { ActionsAllowed, AllowActionCallback, Auth } from "@verdaccio/auth";
import type { pluginUtils } from "@verdaccio/core";
import { errorUtils } from "@verdaccio/core";
import type { AllowAccess, AuthPackageAllow, RemoteUser } from "@verdaccio/types";
import type { Application } from "express";

import { plugin } from "@/constants";
import { loadClientEntry } from "@/server/client-assets";
import ParsedPluginConfig, { type OpenIDConfig } from "@/server/config/Config";
import { ERRORS } from "@/server/constants";
import { debug } from "@/server/debugger";
import { CliFlow, WebAuthFlow, WebFlow } from "@/server/flows";
import logger, { setLogger } from "@/server/logger";
import { OpenIDConnectAuthProvider } from "@/server/openid";
import { registerGlobalProxy } from "@/server/proxy-agent";
import { createStore } from "@/server/store";
import type { Store } from "@/server/store/Store";

import { AuthCore, type VerifiedUser } from "./AuthCore";
import type { AuthProvider } from "./AuthProvider";
import { PatchHtml } from "./PatchHtml";
import { ServeStatic } from "./ServeStatic";
import { getPackageSpec } from "./utils";

export interface PluginMiddleware {
  register_middlewares(app: Application): void;
}

interface AllowActionMeta {
  packageSpec: string;
  action: ActionsAllowed;
  requiredGroups?: string[];
}

/**
 * The plugin entry point: Verdaccio's auth hooks and HTTP middleware, plus the
 * store whose connection has to be closed when the process stops.
 */
export class Plugin
  implements pluginUtils.Auth<AllowAccess & OpenIDConfig>, pluginUtils.ExpressMiddleware<OpenIDConfig, never, Auth>
{
  private readonly parsedConfig: ParsedPluginConfig;
  private readonly provider: AuthProvider;
  private readonly core: AuthCore;
  private readonly store: Store;

  private storeClosing = false;
  private signalHandlers = new Map<NodeJS.Signals, () => void>();

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

    let store: Store;
    try {
      store = createStore(parsedConfig);
    } catch (e: any) {
      logger.error({ err: e }, "Failed to create store: @{err}");
      throw e;
    }

    const provider = new OpenIDConnectAuthProvider(parsedConfig, store);
    const core = new AuthCore(parsedConfig, provider);

    this.parsedConfig = parsedConfig;
    this.provider = provider;
    this.core = core;
    this.store = store;

    // close store on process termination
    this.registerSignalHandlers();
  }

  public get version(): number {
    return +plugin.version;
  }

  public getVersion(): number {
    return this.version;
  }

  /**
   * Close the store when the process is asked to stop.
   *
   * Called from the constructor. Call it again to re-register the handlers after
   * `unregisterSignalHandlers()`, which tests need between runs.
   */
  public registerSignalHandlers(): void {
    // Unregister any existing handlers first
    this.unregisterSignalHandlers();

    for (const signal of ["SIGINT", "SIGQUIT", "SIGTERM", "SIGHUP"] as const) {
      const handler = async () => {
        if (this.storeClosing) return;
        this.storeClosing = true;

        try {
          debug("Received signal %s, closing store...", signal);

          await this.store.close();

          debug("Store closed, good bye!");
        } catch (e: any) {
          debug("Error closing store: %s", e.message);
        }
      };

      process.once(signal, handler);
      this.signalHandlers.set(signal, handler);
    }
  }

  /** Detach the signal handlers, so a stopped process can exit and tests can rerun. */
  public unregisterSignalHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers.clear();
  }

  public register_middlewares(app: Application, auth: Auth, _storage: never) {
    this.core.setAuth(auth);

    const children = [
      new ServeStatic(),
      new PatchHtml(this.parsedConfig, loadClientEntry()),
      new WebFlow(this.parsedConfig, this.core, this.provider, this.store),
      new CliFlow(),
      new WebAuthFlow(this.parsedConfig, this.core, this.provider, this.store),
    ] satisfies PluginMiddleware[];

    for (const child of children) {
      child.register_middlewares(app);
    }
  }

  public async authenticate(username: string, token: string, callback: pluginUtils.AuthCallback): Promise<void> {
    if (!username || !token) {
      debug("username or token is empty, skip authentication");

      // set error to null, next auth plugin will be called
      callback(null, false);
      return;
    }

    if (!this.core.isLegacySecurity) {
      // A legacy `npm login` sends its password here. In jwt mode that password is
      // not a password, and a token in that slot would let Verdaccio issue a new
      // token with a fresh expiry, forever, without asking the provider.
      debug("jwt npm tokens are not accepted as passwords, next auth plugin will be called");

      callback(null, false);
      return;
    }

    debug("authenticating user, username: %s", username);

    let user: VerifiedUser | false;
    try {
      user = await this.core.verifyLegacyToken(token);
    } catch (e: any) {
      // Not a token this plugin issued: the next auth plugin (e.g. htpasswd) gets its turn.
      if (e?.message === ERRORS.INVALID_TOKEN) {
        debug(`%s. user: "%s", falling back to legacy auth`, e.message, username);

        callback(null, false);
        return;
      }

      // Our own token, but it could not be checked: a provider outage must not look like
      // a wrong password.
      logger.warn({ err: e }, "failed to verify the npm token of @{username}");

      callback(errorUtils.getUnauthorized(`user ${username} is not authenticated`), false);
      return;
    }

    // `false` means the token is expired, belongs to another subject, or is not authorized.
    if (!user || !user.name) {
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

  private allow_action(user: RemoteUser, meta: AllowActionMeta, callback: AllowActionCallback): void {
    if (!user.name) {
      // Let the next auth plugin handle a user this plugin does not know.
      callback(null, false);
      return;
    }

    debug(
      "check %s: %s (%j) -> %s, required: %j",
      meta.action,
      user.name,
      user.real_groups,
      meta.packageSpec,
      meta.requiredGroups,
    );

    let userGroups: string[];
    // The groups that grant access may change after login, so an authenticated
    // user is checked against the logged-in roles and everyone else against the
    // visitor roles. That way the package still resolves to the right groups.
    if (this.core.authenticate(user.name, user.real_groups)) {
      userGroups = this.core.getLoggedUserGroups(user);
    } else {
      logger.info(
        { user: user.name, groups: JSON.stringify(user.real_groups) },
        `User "@{user}" with groups @{groups} is not authenticated now, treating as non-logged user`,
      );
      userGroups = this.core.getNonLoggedUserGroups();
    }

    const isGranted = !!meta.requiredGroups?.some((group) => user.name === group || userGroups.includes(group));

    if (isGranted) {
      callback(null, true);
      return;
    }

    callback(errorUtils.getForbidden(`user ${user.name} is not allowed to ${meta.action} package ${meta.packageSpec}`));
  }

  public allow_access(user: RemoteUser, pkg: AuthPackageAllow, callback: AllowActionCallback): void {
    this.allow_action(
      user,
      { packageSpec: getPackageSpec(pkg), action: "access", requiredGroups: pkg.access },
      callback,
    );
  }

  public allow_publish(user: RemoteUser, pkg: AuthPackageAllow, callback: AllowActionCallback): void {
    this.allow_action(
      user,
      { packageSpec: getPackageSpec(pkg), action: "publish", requiredGroups: pkg.publish },
      callback,
    );
  }

  public allow_unpublish(user: RemoteUser, pkg: AuthPackageAllow, callback: AllowActionCallback): void {
    const requiredGroups = pkg.unpublish;

    if (requiredGroups === false) {
      // Verdaccio calls this hook even when `unpublish` is false; answering
      // without a decision makes it defer to `allow_publish`.
      callback(null);
      return;
    }
    if (requiredGroups === true) {
      callback(errorUtils.getInternalError(`invalid unpublish configuration for package ${pkg.name}`));
      return;
    }

    this.allow_action(user, { packageSpec: getPackageSpec(pkg), action: "unpublish", requiredGroups }, callback);
  }
}
