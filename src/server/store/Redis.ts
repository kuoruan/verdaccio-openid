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
  private readonly redis: Cluster | Redis;
  private readonly ttl: number;

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
          nodes,
          password,
          redisOptions,
          ttl = defaultTTL,
          username,
          ...restOpts
        } = opts satisfies RedisClusterConfig;

        this.redis = new Redis.Cluster(nodes, {
          redisOptions: { ...restDefaultOpts, password, username, ...redisOptions },
          ...restOpts,
        });

        this.ttl = ttl;
      } else {
        const { nodes: _, ttl, ...restOpts } = { ...defaultOptions, ...opts } satisfies RedisConfig;

        this.redis = new Redis(restOpts);

        this.ttl = ttl;
      }
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async deleteState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.del(stateKey);
  }

  async getState(key: string, providerId: string): Promise<null | string> {
    const stateKey = this.getStateKey(key, providerId);

    const exists = await this.isKeyExists(stateKey);

    if (!exists) return null;

    return this.redis.get(stateKey);
  }

  async getUserGroups(key: string, providerId: string): Promise<null | string[]> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    const exists = await this.redis.exists(groupsKey);
    if (!exists) return null;

    return this.redis.lrange(groupsKey, 0, -1);
  }

  async getUserInfo(key: string, providerId: string): Promise<null | Record<string, unknown>> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    const exists = await this.redis.exists(userInfoKey);
    if (!exists) return null;

    return this.redis.hgetall(userInfoKey);
  }

  async setState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.set(stateKey, nonce, "PX", this.ttl);
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    await this.redis.lpush(groupsKey, ...groups);
    await this.redis.pexpire(groupsKey, USER_GROUPS_CACHE_TTL);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    await this.redis.hset(userInfoKey, data as Record<string, unknown>);
    await this.redis.pexpire(userInfoKey, USER_INFO_CACHE_TTL);
  }

  private async isKeyExists(key: string): Promise<boolean> {
    const times = await this.redis.exists(key);

    return times > 0;
  }
}
