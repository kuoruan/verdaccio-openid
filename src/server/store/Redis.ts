import { Cluster, Redis } from "ioredis";

import {
  BaseStore,
  type RedisClusterConfig,
  type RedisConfig,
  STATE_TTL,
  type Store,
  USER_GROUPS_CACHE_TTL,
  USER_INFO_CACHE_TTL,
} from "./Store";

const defaultOptions = {
  ttl: STATE_TTL,
} satisfies RedisConfig;

export default class RedisStore extends BaseStore implements Store {
  private readonly ttl: number;
  private readonly redis: Cluster | Redis;

  constructor(opts?: RedisConfig | string) {
    super();

    if (!opts) {
      const { ttl, ...restOpts } = defaultOptions;

      this.redis = new Redis(restOpts);

      this.ttl = ttl;
    } else if (typeof opts === "string") {
      const { ttl, ...restOpts } = defaultOptions;

      this.redis = new Redis(opts, restOpts);

      this.ttl = ttl;
    } else {
      if (opts?.nodes) {
        const { ttl: defaultTTL, ...restDefaultOpts } = defaultOptions;

        const {
          ttl = defaultTTL,
          nodes,
          username,
          password,
          redisOptions,
          ...restOpts
        } = opts satisfies RedisClusterConfig;

        this.redis = new Redis.Cluster(nodes, {
          redisOptions: { ...restDefaultOpts, username, password, ...redisOptions },
          ...restOpts,
        });

        this.ttl = ttl;
      } else {
        const { ttl, nodes: _, ...restOpts } = { ...defaultOptions, ...opts } satisfies RedisConfig;

        this.redis = new Redis(restOpts);

        this.ttl = ttl;
      }
    }
  }

  private async isKeyExists(key: string): Promise<boolean> {
    const times = await this.redis.exists(key);

    return times > 0;
  }

  async setState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.set(stateKey, nonce, "PX", this.ttl);
  }

  async getState(key: string, providerId: string): Promise<string | null> {
    const stateKey = this.getStateKey(key, providerId);

    const exists = await this.isKeyExists(stateKey);

    if (!exists) return null;

    return this.redis.get(stateKey);
  }

  async deleteState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.del(stateKey);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    await this.redis.hset(userInfoKey, data as Record<string, unknown>);
    await this.redis.pexpire(userInfoKey, USER_INFO_CACHE_TTL);
  }

  async getUserInfo(key: string, providerId: string): Promise<Record<string, unknown> | null> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    const exists = await this.redis.exists(userInfoKey);
    if (!exists) return null;

    return this.redis.hgetall(userInfoKey);
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    await this.redis.lpush(groupsKey, ...groups);
    await this.redis.pexpire(groupsKey, USER_GROUPS_CACHE_TTL);
  }

  async getUserGroups(key: string, providerId: string): Promise<string[] | null> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    const exists = await this.redis.exists(groupsKey);
    if (!exists) return null;

    return this.redis.lrange(groupsKey, 0, -1);
  }

  async setWebAuthnToken(key: string, token: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    await this.redis.set(tokenKey, token);
  }

  async getWebAuthnToken(key: string): Promise<string | null> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    return this.redis.get(tokenKey);
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    await this.redis.del(tokenKey);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
