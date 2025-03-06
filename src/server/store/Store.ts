import type { Options as TTLCacheOptions } from "@isaacs/ttlcache";
import type { ClusterNode as RedisClusterNode, ClusterOptions as RedisClusterOptions, RedisOptions } from "ioredis";
import type { InitOptions as FileInitOptions } from "node-persist";

export interface Store {
  /** set state data to the store */
  setState(key: string, nonce: string, providerId: string): MaybePromise<void>;

  /** get state data from the store */
  getState(key: string, providerId: string): MaybePromise<string | null | undefined>;

  /** delete state data from the store */
  deleteState(key: string, providerId: string): MaybePromise<void>;

  /** set user info to the store */
  setUserInfo?: (key: string, data: unknown, providerId: string) => MaybePromise<void>;

  /** get user info from the store */
  getUserInfo?: (key: string, providerId: string) => MaybePromise<Record<string, unknown> | null | undefined>;

  /** set user groups to the store */
  setUserGroups?: (key: string, groups: string[], providerId: string) => MaybePromise<void>;

  /** get user groups from the store */
  getUserGroups?: (key: string, providerId: string) => MaybePromise<string[] | null | undefined>;

  /** close the store */
  close: () => MaybePromise<void>;
}

export class BaseStore {
  protected getStateKey(key: string, providerId: string): string {
    return `${providerId}:state:${key}`;
  }

  protected getUserInfoKey(key: string, providerId: string): string {
    return `${providerId}:userinfo:${key}`;
  }

  protected getUserGroupsKey(key: string, providerId: string): string {
    return `${providerId}:groups:${key}`;
  }
}

/** The State and nonce ttl */
export const STATE_TTL = 1 * 60 * 1000; // 1 minute

/** The userinfo cache ttl */
export const USER_INFO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** The user groups cache ttl */
export const USER_GROUPS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export enum StoreType {
  InMemory = "in-memory",
  Redis = "redis",
  File = "file",
}

interface StoreBaseConfig {
  ttl?: number;
}

export type InMemoryConfig = TTLCacheOptions<string, string> & StoreBaseConfig;

interface RedisBaseConfig extends StoreBaseConfig {
  username?: string;
  password?: string;
}

export interface RedisSineleConfig extends RedisBaseConfig, RedisOptions {
  nodes?: never;
}

export interface RedisClusterConfig extends RedisBaseConfig, RedisClusterOptions {
  nodes: RedisClusterNode[];
}

export type RedisConfig = RedisSineleConfig | RedisClusterConfig;

export interface FileConfig extends StoreBaseConfig, Omit<FileInitOptions, "ttl"> {
  dir: string;
}
