import type { TTLCacheOptions } from "@isaacs/ttlcache";
import type { ClusterNode as RedisClusterNode, ClusterOptions as RedisClusterOptions, RedisOptions } from "ioredis";
import type { InitOptions as FileInitOptions } from "node-persist";

import { webAuthnProviderId } from "@/constants";

export interface Store {
  /** set openid state data to the store */
  setOpenIDState(key: string, nonce: string, providerId: string): MaybePromise<void>;

  /** get openid state data from the store */
  getOpenIDState(key: string, providerId: string): MaybePromise<string | null | undefined>;

  /** delete openid state data from the store */
  deleteOpenIDState(key: string, providerId: string): MaybePromise<void>;

  /** set user info to the store */
  setUserInfo?: (key: string, data: unknown, providerId: string) => MaybePromise<void>;

  /** get user info from the store */
  getUserInfo?: (key: string, providerId: string) => MaybePromise<Record<string, unknown> | null | undefined>;

  /** set user groups to the store */
  setUserGroups?: (key: string, groups: string[], providerId: string) => MaybePromise<void>;

  /** get user groups from the store */
  getUserGroups?: (key: string, providerId: string) => MaybePromise<string[] | null | undefined>;

  /** set webauthn token to the store */
  setWebAuthnToken: (key: string, token: string) => MaybePromise<void>;

  /** get webauthn token from the store */
  getWebAuthnToken: (key: string) => MaybePromise<string | null | undefined>;

  /** delete webauthn token from the store */
  deleteWebAuthnToken: (key: string) => MaybePromise<void>;

  /** close the store */
  close: () => MaybePromise<void>;
}

export class BaseStore {
  /** The State ttl */
  public static readonly DefaultStateTTL: number = 1 * 60 * 1000; // 1 minute;
  /** The other data cache ttl */
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
