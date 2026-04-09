import { Cluster, Redis } from "ioredis";

import { BaseStore, type RedisClusterConfig, type RedisConfig, type RedisSingleConfig, type Store } from "./Store";

const TAKE_WEB_AUTHN_TOKEN_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then
  return false
end
if value ~= ARGV[1] then
  redis.call("DEL", KEYS[1])
end
return value
`;

const defaultOptions = {
  ttl: BaseStore.DefaultStateTTL,
} satisfies RedisSingleConfig;

export default class RedisStore extends BaseStore implements Store {
  private readonly ttl: number;
  private readonly redis: Cluster | Redis;

  constructor(opts?: RedisConfig | string) {
    super();

    const { redis, ttl } = this.createClient(opts);

    this.redis = redis;
    this.ttl = ttl;
  }

  private createClient(opts?: RedisConfig | string): { redis: Cluster | Redis; ttl: number } {
    const { ttl: defaultTTL, ...restDefaultOpts } = defaultOptions;

    if (!opts) {
      return { redis: new Redis(restDefaultOpts), ttl: defaultTTL };
    }

    if (typeof opts === "string") {
      return { redis: new Redis(opts, restDefaultOpts), ttl: defaultTTL };
    }

    if (opts?.nodes?.length) {
      const {
        ttl = defaultTTL,
        nodes,
        username,
        password,
        redisOptions,
        ...restOpts
      } = opts satisfies RedisClusterConfig;

      return {
        redis: new Redis.Cluster(nodes, {
          redisOptions: { ...restDefaultOpts, username, password, ...redisOptions },
          ...restOpts,
        }),
        ttl,
      };
    }

    const { ttl, nodes: _, ...restOpts } = { ...defaultOptions, ...opts } satisfies RedisConfig;

    return { redis: new Redis(restOpts), ttl };
  }

  async setOpenIDState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.set(stateKey, nonce, "PX", this.ttl);
  }

  async getOpenIDState(key: string, providerId: string): Promise<string | null> {
    const stateKey = this.getStateKey(key, providerId);
    return this.redis.get(stateKey);
  }

  async deleteOpenIDState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.redis.del(stateKey);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    const pipeline = this.redis.multi();

    pipeline.hset(userInfoKey, data as Record<string, unknown>);
    pipeline.pexpire(userInfoKey, BaseStore.DefaultDataTTL);

    await pipeline.exec();
  }

  async getUserInfo(key: string, providerId: string): Promise<Record<string, unknown> | null> {
    const userInfoKey = this.getUserInfoKey(key, providerId);
    const userInfo = await this.redis.hgetall(userInfoKey);

    if (Object.keys(userInfo).length === 0) return null;

    return userInfo;
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    const pipeline = this.redis.multi();

    pipeline.del(groupsKey);

    if (groups.length > 0) {
      pipeline.rpush(groupsKey, ...groups);
      pipeline.pexpire(groupsKey, BaseStore.DefaultDataTTL);
    }

    await pipeline.exec();
  }

  async getUserGroups(key: string, providerId: string): Promise<string[] | null> {
    const groupsKey = this.getUserGroupsKey(key, providerId);
    const groups = await this.redis.lrange(groupsKey, 0, -1);

    if (groups.length === 0) return null;

    return groups;
  }

  async setWebAuthnToken(key: string, token: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    await this.redis.set(tokenKey, token, "PX", this.ttl);
  }

  async getWebAuthnToken(key: string): Promise<string | null> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    return this.redis.get(tokenKey);
  }

  async takeWebAuthnToken(key: string, pendingToken: string): Promise<string | null> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const response = await this.redis.eval(TAKE_WEB_AUTHN_TOKEN_SCRIPT, 1, tokenKey, pendingToken);

    if (typeof response !== "string") {
      return null;
    }

    return response;
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    await this.redis.del(tokenKey);
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
