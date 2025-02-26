import type { Options as TTLCacheOptions } from "@isaacs/ttlcache";
import type { ClusterNode as RedisClusterNode, ClusterOptions as RedisClusterOptions, RedisOptions } from "ioredis";
import type { InitOptions as FileInitOptions } from "node-persist";

export interface Store {
  /** close the store */
  close: () => MaybePromise<void>;

  /** delete state data from the store */
  deleteState(key: string, providerId: string): MaybePromise<void>;

  /** get state data from the store */
  getState(key: string, providerId: string): MaybePromise<null | string | undefined>;

  /** get user groups from the store */
  getUserGroups?: (key: string, providerId: string) => MaybePromise<null | string[] | undefined>;

  /** get user info from the store */
  getUserInfo?: (key: string, providerId: string) => MaybePromise<null | Record<string, unknown> | undefined>;

  /** set state data to the store */
  setState(key: string, nonce: string, providerId: string): MaybePromise<void>;

  /** set user groups to the store */
  setUserGroups?: (key: string, groups: string[], providerId: string) => MaybePromise<void>;

  /** set user info to the store */
  setUserInfo?: (key: string, data: unknown, providerId: string) => MaybePromise<void>;
}

export class BaseStore {
  protected getStateKey(key: string, providerId: string): string {
    return `${providerId}:state:${key}`;
  }

  protected getUserGroupsKey(key: string, providerId: string): string {
    return `${providerId}:groups:${key}`;
  }

  protected getUserInfoKey(key: string, providerId: string): string {
    return `${providerId}:userinfo:${key}`;
  }
}

/** The State and nonce ttl */
export const STATE_TTL = 1 * 60 * 1000; // 1 minute

/** The userinfo cache ttl */
export const USER_INFO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** The user groups cache ttl */
export const USER_GROUPS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export enum StoreType {
  File = "file",
  InMemory = "in-memory",
  Redis = "redis",
}

export interface FileConfig extends Omit<FileInitOptions, "ttl">, StoreBaseConfig {
  dir: string;
}

export type InMemoryConfig = StoreBaseConfig & TTLCacheOptions<string, string>;

export interface RedisClusterConfig extends RedisBaseConfig, RedisClusterOptions {
  nodes: RedisClusterNode[];
}

export type RedisConfig = RedisClusterConfig | RedisSineleConfig;

export interface RedisSineleConfig extends RedisBaseConfig, RedisOptions {
  nodes?: never;
}

interface RedisBaseConfig extends StoreBaseConfig {
  password?: string;
  username?: string;
}

interface StoreBaseConfig {
  ttl?: number;
}
