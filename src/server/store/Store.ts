import type { TTLCacheOptions } from "@isaacs/ttlcache";
import type { ClusterNode as RedisClusterNode, ClusterOptions as RedisClusterOptions, RedisOptions } from "ioredis";
import type { InitOptions as FileInitOptions } from "node-persist";

import { webAuthnProviderId } from "@/constants";

export interface Store {
  /** Save the nonce of an authorization request until its callback arrives. */
  setOpenIDState(key: string, nonce: string, providerId: string): MaybePromise<void>;

  /** Read the nonce stored for an authorization request. */
  getOpenIDState(key: string, providerId: string): MaybePromise<string | null | undefined>;

  /** Remove the nonce once its callback has been handled. */
  deleteOpenIDState(key: string, providerId: string): MaybePromise<void>;

  /** Cache the user info claims read from the provider. */
  setUserInfo?: (key: string, data: unknown, providerId: string) => MaybePromise<void>;

  /** Read the cached user info claims. */
  getUserInfo?: (key: string, providerId: string) => MaybePromise<Record<string, unknown> | null | undefined>;

  /** Cache the groups read from the provider. */
  setUserGroups?: (key: string, groups: string[], providerId: string) => MaybePromise<void>;

  /** Read the cached groups. */
  getUserGroups?: (key: string, providerId: string) => MaybePromise<string[] | null | undefined>;

  /** Save the token the browser reports for a WebAuthn session. */
  setWebAuthnToken: (key: string, token: string) => MaybePromise<void>;

  /** Read the token stored for a WebAuthn session. */
  getWebAuthnToken: (key: string) => MaybePromise<string | null | undefined>;

  /**
   * Atomically read the WebAuthn token of a session and consume it once it is ready.
   *
   * A token still equal to `pendingToken` is kept, because the browser has not
   * reported the credential yet; any other token is returned and deleted.
   */
  takeWebAuthnToken: (key: string, pendingToken: string) => MaybePromise<string | null | undefined>;

  /** Remove the token of a WebAuthn session. */
  deleteWebAuthnToken: (key: string) => MaybePromise<void>;

  /** Release the backend connection. */
  close: () => MaybePromise<void>;
}

export class BaseStore {
  /** TTL of authorization state: the nonce and the WebAuthn token. */
  public static readonly DefaultStateTTL: number = 1 * 60 * 1000; // 1 minute;
  /** TTL of the user info and groups caches. */
  public static readonly DefaultDataTTL: number = 5 * 60 * 1000; // 5 minutes;

  protected getStateKey(key: string, providerId: string): string {
    return `${providerId}:state:${key}`;
  }

  protected getUserInfoKey(key: string, providerId: string): string {
    return `${providerId}:userinfo:${key}`;
  }

  protected getUserGroupsKey(key: string, providerId: string): string {
    return `${providerId}:groups:${key}`;
  }

  protected getWebAuthnTokenKey(sessionId: string): string {
    return `${webAuthnProviderId}:${sessionId}`;
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
