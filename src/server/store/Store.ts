import type { TTLCacheOptions } from "@isaacs/ttlcache";
import type { ClusterNode as RedisClusterNode, ClusterOptions as RedisClusterOptions, RedisOptions } from "ioredis";
import type { InitOptions as FileInitOptions } from "node-persist";

import { webAuthnProviderId } from "@/server/constants";
import { isObject, isUndefined, safeJsonStringify } from "@/utils";
import { loginResultNamespace, PENDING_TOKEN } from "./constants";

import { parseLoginResult, toWebAuthnSession } from "./utils";

/** The credentials a finished login hands to the browser. */
export interface LoginResult {
  username: string;
  uiToken: string;
  npmToken: string;
}

/** The state of an `npm login --auth-type=web` session. Only `ready` carries a token. */
export type WebAuthnSession = { status: "pending" } | { status: "ready"; token: string };

/** The nonce of an authorization request, removed once its callback arrives. */
export interface OpenIDStateStore {
  /** Save the nonce of an authorization request until its callback arrives. */
  setOpenIDState(key: string, nonce: string, providerId: string): MaybePromise<void>;

  /** Read the nonce stored for an authorization request, or undefined when it is not there. */
  getOpenIDState(key: string, providerId: string): MaybePromise<string | undefined>;

  /** Remove the nonce once its callback has been handled. */
  deleteOpenIDState(key: string, providerId: string): MaybePromise<void>;
}

/** The provider claims a user was authenticated with, cached by provider. */
export interface ProviderCache {
  /** Cache the user info claims read from the provider. */
  setUserInfo(key: string, data: Record<string, unknown>, providerId: string): MaybePromise<void>;

  /** Read the cached user info claims, or undefined when there are none. */
  getUserInfo(key: string, providerId: string): MaybePromise<Record<string, unknown> | undefined>;

  /** Cache the groups read from the provider. */
  setUserGroups(key: string, groups: string[], providerId: string): MaybePromise<void>;

  /** Read the cached groups, or undefined when there are none. */
  getUserGroups(key: string, providerId: string): MaybePromise<string[] | undefined>;
}

/**
 * The `npm login --auth-type=web` session: the browser reports the credential,
 * the CLI collects it. A session that is still pending cannot be consumed.
 */
export interface WebAuthnStore {
  /** Start a session that waits for the browser to report its credential. */
  setWebAuthnSession(key: string, session: WebAuthnSession): MaybePromise<void>;

  /** Read the session, or undefined when it is unknown, used or expired. */
  getWebAuthnSession(key: string): MaybePromise<WebAuthnSession | undefined>;

  /**
   * Read a ready session and consume it, so the token is handed out once. A
   * pending session is kept, and reported as pending.
   *
   * The promise holds per backend: Redis and the database adapters consume in
   * one operation, while the file backend has no lock and can hand the same
   * session to two concurrent readers (see docs/store-config.md).
   */
  takeWebAuthnSession(key: string): MaybePromise<WebAuthnSession | undefined>;

  /** Drop a failed or rejected session. */
  deleteWebAuthnSession(key: string): MaybePromise<void>;
}

/** The credentials of a finished web login, collected by the browser once. */
export interface LoginResultStore {
  /** Save the credentials of a login until the browser asks for them. */
  setLoginResult(key: string, result: LoginResult): MaybePromise<void>;

  /** Read and consume the credentials, or undefined when they are not there. */
  takeLoginResult(key: string): MaybePromise<LoginResult | undefined>;
}

/** Everything a backend stores. Flows depend on the slice they use. */
export interface Store extends OpenIDStateStore, ProviderCache, WebAuthnStore, LoginResultStore {
  /** Release the backend connection. */
  close: () => MaybePromise<void>;
}

/** The trailing argument of the storage hooks: which provider namespace a row lives in. */
export interface StoreContext {
  providerId?: string;
}

/**
 * The internal storage kinds a backend holds. This is a closed set of
 * storage categories, not an arbitrary namespace: flows never see it.
 * Each kind maps to the backend's own row shape and TTL class: state kinds
 * share the state TTL, cache kinds share the data TTL.
 */
export type StoreKind = "state" | "userInfo" | "userGroups" | "webAuthn" | "loginResult";

/** The kinds that support atomic consume. A closed set, like StoreKind. */
export type TakeKind = "webAuthn" | "loginResult";

/** The native value each kind carries through the storage hooks. */
export interface StoredValues {
  state: string;
  userInfo: Record<string, unknown>;
  userGroups: string[];
  /** The raw token as stored (the pending sentinel included). */
  webAuthn: string;
  /** The already-serialized login result. */
  loginResult: string;
}

export abstract class BaseStore {
  /**
   * Resolve the namespaced row key of a kind. Backends call this in the
   * storage hooks. The hooks receive the raw `key`, so key checks target
   * the original key.
   */
  protected rowKey(kind: StoreKind, key: string, context?: StoreContext): string {
    switch (kind) {
      case "state":
        return `${context?.providerId}:state:${key}`;
      case "userInfo":
        return `${context?.providerId}:userinfo:${key}`;
      case "userGroups":
        return `${context?.providerId}:groups:${key}`;
      case "webAuthn":
        return `${webAuthnProviderId}:${key}`;
      case "loginResult":
        return `${loginResultNamespace}:login:${key}`;
    }
  }

  // ── Storage hooks: each backend implements these four (plus `close`
  // on the Store interface). The hooks take the raw key and context;
  // `validate` runs in the shared domain methods before any hook, so
  // backends only worry about row shapes, TTLs, and error policy.
  // Key namespacing goes through rowKey above. ────────────────

  /** Read the native value of a kind, or undefined when it is not there. */
  protected abstract read<K extends StoreKind>(
    kind: K,
    key: string,
    context?: StoreContext,
  ): MaybePromise<StoredValues[K] | undefined>;

  /** Write the native value of a kind, applying the kind's TTL class. */
  protected abstract write<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): MaybePromise<void>;

  /**
   * Remove the row of a kind. DynamoDB and MongoDB swallow delete errors
   * (a stale row expires via TTL); the other backends propagate them.
   * Key validation errors are thrown by every backend.
   */
  protected abstract remove(kind: StoreKind, key: string, context?: StoreContext): MaybePromise<void>;

  /**
   * Check whether the backend accepts a stored value, throwing when it
   * does not. The shared domain methods call this before every storage
   * hook; backends only implement their own size rules. `value` is the
   * encoded storage input (`undefined` for paths without one: reads,
   * removes, and takes); callers must test it with `!== undefined` so an
   * empty string counts as a value.
   */
  protected validate<K extends StoreKind>(
    _kind: K,
    _key: string,
    _value: StoredValues[K] | undefined,
    _context?: StoreContext,
  ): void {}

  /**
   * Atomically read the raw value of a take kind and consume it.
   * `webAuthn`: a pending row is reported without delete; a ready row
   * is deleted in the backend's own atomic step. `loginResult`: the
   * row is deleted in the backend's own single step. No default:
   * read-then-delete would interleave even in a single process once
   * awaited. The File backend is the known lock-free exception
   * (see its take method).
   */
  protected abstract take(kind: TakeKind, key: string, context?: StoreContext): MaybePromise<string | undefined>;

  // ── Shared domain methods: one copy for all backends. Encoding,
  // sentinel mapping, empty-groups deletion, and object validation live
  // here; row shapes, TTL values, consistency, size limits, and error
  // policy stay in the backends. ─────────────────────────────────────

  private async writeValidated<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): Promise<void> {
    this.validate(kind, key, value, context);
    return this.write(kind, key, value, context);
  }

  setOpenIDState(key: string, nonce: string, providerId: string): MaybePromise<void> {
    return this.writeValidated("state", key, nonce, { providerId });
  }

  async getOpenIDState(key: string, providerId: string): Promise<string | undefined> {
    try {
      this.validate("state", key, undefined, { providerId });
    } catch {
      // An oversized key can never match a stored row: report it as a
      // miss instead of failing the login. The storage call stays outside
      // the catch so database errors still propagate.
      return undefined;
    }
    return this.read("state", key, { providerId });
  }

  async deleteOpenIDState(key: string, providerId: string): Promise<void> {
    this.validate("state", key, undefined, { providerId });
    return this.remove("state", key, { providerId });
  }

  setUserInfo(key: string, data: unknown, providerId: string): MaybePromise<void> {
    if (!isObject(data)) {
      throw new TypeError("userinfo data must be an object");
    }

    return this.writeValidated("userInfo", key, data, { providerId });
  }

  async getUserInfo(key: string, providerId: string): Promise<Record<string, unknown> | undefined> {
    try {
      this.validate("userInfo", key, undefined, { providerId });
    } catch {
      return undefined;
    }
    return this.read("userInfo", key, { providerId });
  }

  setUserGroups(key: string, groups: string[], providerId: string): MaybePromise<void> {
    const context = { providerId };
    if (groups.length === 0) {
      this.validate("userGroups", key, [], context);
      return this.remove("userGroups", key, context);
    }

    return this.writeValidated("userGroups", key, groups, context);
  }

  async getUserGroups(key: string, providerId: string): Promise<string[] | undefined> {
    try {
      this.validate("userGroups", key, undefined, { providerId });
    } catch {
      return undefined;
    }
    return this.read("userGroups", key, { providerId });
  }

  setWebAuthnSession(key: string, session: WebAuthnSession): MaybePromise<void> {
    const value = session.status === "pending" ? PENDING_TOKEN : session.token;
    return this.writeValidated("webAuthn", key, value);
  }

  async getWebAuthnSession(key: string): Promise<WebAuthnSession | undefined> {
    try {
      this.validate("webAuthn", key, undefined);
    } catch {
      return undefined;
    }
    return toWebAuthnSession(await this.read("webAuthn", key));
  }

  async takeWebAuthnSession(key: string): Promise<WebAuthnSession | undefined> {
    this.validate("webAuthn", key, undefined);
    return toWebAuthnSession(await this.take("webAuthn", key, undefined));
  }

  async deleteWebAuthnSession(key: string): Promise<void> {
    this.validate("webAuthn", key, undefined);
    return this.remove("webAuthn", key);
  }

  setLoginResult(key: string, result: LoginResult): MaybePromise<void> {
    const serialized = safeJsonStringify(result);

    // The credentials are three strings, so this guards the type, not real data.
    if (isUndefined(serialized)) throw new Error("The login result is not serializable");

    return this.writeValidated("loginResult", key, serialized);
  }

  async takeLoginResult(key: string): Promise<LoginResult | undefined> {
    try {
      this.validate("loginResult", key, undefined);
    } catch {
      return undefined;
    }
    return parseLoginResult(await this.take("loginResult", key, undefined));
  }
}

export enum StoreType {
  InMemory = "in-memory",
  Redis = "redis",
  File = "file",
  DynamoDB = "dynamodb",
  MongoDB = "mongodb",
}

interface StoreBaseConfig {
  ttl?: number;
}

export type InMemoryConfig = TTLCacheOptions<string, string> & StoreBaseConfig;

interface RedisBaseConfig extends StoreBaseConfig {
  username?: string;
  password?: string;
}

export interface RedisSingleConfig extends RedisBaseConfig, RedisOptions {
  nodes?: never;
}

export interface RedisClusterConfig extends RedisBaseConfig, RedisClusterOptions {
  nodes: RedisClusterNode[];
}

export type RedisConfig = RedisSingleConfig | RedisClusterConfig;

export interface FileConfig extends StoreBaseConfig, Omit<FileInitOptions, "ttl"> {
  dir: string;
}

export interface DynamoConfig extends StoreBaseConfig {
  /** DynamoDB table name. Must already exist with pk (S) hash key,
   *  sk (S) range key, and `expires` configured as the TTL attribute. */
  tableName: string;
  /** AWS region of the table. */
  region: string;
  /** Partition-key value to namespace this plugin's rows. Default
   *  "OIDC". Set a unique value when sharing the table with other
   *  writers (e.g. verdaccio-aws-s3-storage which uses pk=PACKAGE
   *  / pk=CONFIG). */
  partitionKey?: string;
}

export interface MongoConfig extends StoreBaseConfig {
  /** MongoDB connection string (`mongodb://` or `mongodb+srv://`).
   *  Credentials and driver options (TLS, auth mechanism, replica set,
   *  ...) all travel in the connection string. */
  uri: string;
  /** Database name. Defaults to the database named in the connection
   *  string, falling back to "verdaccio-openid". */
  database?: string;
  /** Collection name. Default "openid-store". */
  collection?: string;
}
