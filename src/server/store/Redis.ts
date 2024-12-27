import Redis, { type RedisCommander } from "ioredis";

import { BaseStore, type RedisConfig, STATE_TTL, type Store } from "./Store";

const defaultOptions = {
  ttl: STATE_TTL,
} satisfies RedisConfig;

export default class RedisStore extends BaseStore implements Store {
  private readonly ttl: number;
  private readonly redis: RedisCommander;

  constructor(opts?: RedisConfig | string) {
    super();

    if (typeof opts === "string") {
      this.redis = new Redis(opts);

      this.ttl = defaultOptions.ttl;
    } else {
      const { ttl, nodes, ...restOpts } = { ...defaultOptions, ...opts };

      this.redis = nodes?.length
        ? new Redis.Cluster(nodes, {
            redisOptions: restOpts,
          })
        : new Redis(restOpts);

      this.ttl = ttl;
    }
  }

  async setState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.set(stateKey, nonce, "PX", this.ttl);
  }

  getState(key: string, providerId: string): Promise<string | null> {
    const stateKey = this.getStateKey(key, providerId);

    return this.redis.get(stateKey);
  }

  async deleteState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.del(stateKey);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    await this.redis.hset(userInfoKey, data as Record<string, unknown>);
    await this.redis.pexpire(userInfoKey, this.ttl);
  }

  getUserInfo(key: string, providerId: string): Promise<Record<string, unknown>> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    return this.redis.hgetall(userInfoKey);
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    await this.redis.lpush(groupsKey, ...groups);
    await this.redis.pexpire(groupsKey, this.ttl);
  }

  async getUserGroups(key: string, providerId: string): Promise<string[]> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    return this.redis.lrange(groupsKey, 0, -1);
  }
}
