import { Cluster, Redis } from "ioredis";

import logger from "@/server/logger";

import {
  BaseStore,
  type RedisConfig,
  STATE_TTL,
  type Store,
  USER_GROUPS_CACHE_TTL,
  USER_INFO_CACHE_TTL,
} from "./Store";

const defaultOptions = {
  ttl: STATE_TTL,
  lazyConnect: true,
} satisfies RedisConfig;

export default class RedisStore extends BaseStore implements Store {
  private readonly ttl: number;
  private readonly redis: Cluster | Redis;

  constructor(opts?: RedisConfig | string) {
    super();

    if (typeof opts === "string") {
      this.redis = new Redis(opts, defaultOptions);

      this.ttl = defaultOptions.ttl;
    } else {
      const { ttl, nodes, ...restOpts } = { ...defaultOptions, ...opts } satisfies RedisConfig;

      this.redis = nodes?.length
        ? new Redis.Cluster(nodes, {
            redisOptions: restOpts,
          })
        : new Redis(restOpts);

      this.ttl = ttl;
    }

    this.redis.connect().catch((e) => {
      logger.error({ message: e.message }, "Failed to connect to redis: @{message}");

      process.exit(1);
    });
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
}
