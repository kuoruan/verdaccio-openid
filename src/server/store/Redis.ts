import type { Cluster, Redis as RedisClient } from "ioredis";

import { importOptional } from "@/server/utils";
import { BaseStore, type RedisClusterConfig, type RedisConfig, type Store } from "./Store";

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
};

export default class RedisStore extends BaseStore implements Store {
  private readonly config?: Omit<RedisConfig, "ttl"> | string;
  private readonly ttl: number;
  private redis?: RedisClient | Cluster;
  private redisPromise?: Promise<RedisClient | Cluster>;

  constructor(opts?: RedisConfig | string) {
    super();

    if (!!opts && typeof opts === "object") {
      const { ttl, ...config } = opts;
      this.config = config;
      this.ttl = ttl ?? defaultOptions.ttl;
    } else {
      this.config = opts;
      this.ttl = defaultOptions.ttl;
    }
  }

  private async getClient(): Promise<RedisClient | Cluster> {
    if (this.redis) return this.redis;

    this.redisPromise ??= (async () => {
      try {
        const { Cluster, Redis } = await importOptional(
          import("ioredis"),
          `store-type "redis" requires the "ioredis" package. Install it: npm add -g ioredis`,
        );

        if (!this.config) {
          this.redis = new Redis();
        } else if (typeof this.config === "string") {
          this.redis = new Redis(this.config);
        } else if (this.config?.nodes?.length) {
          const { nodes, username, password, redisOptions, ...restOpts } = this.config as Omit<RedisClusterConfig, "ttl">;

          this.redis = new Cluster(nodes, {
            redisOptions: { username, password, ...redisOptions },
            ...restOpts,
          });
        } else {
          this.redis = new Redis(this.config);
        }

        return this.redis;
      } catch (err) {
        this.redisPromise = undefined;
        throw err;
      }
    })();

    return this.redisPromise;
  }

  async setOpenIDState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);
    const redis = await this.getClient();

    await redis.set(stateKey, nonce, "PX", this.ttl);
  }

  async getOpenIDState(key: string, providerId: string): Promise<string | null> {
    const stateKey = this.getStateKey(key, providerId);
    const redis = await this.getClient();

    return redis.get(stateKey);
  }

  async deleteOpenIDState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);
    const redis = await this.getClient();

    await redis.del(stateKey);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    if (typeof data !== "object" || data === null) {
      throw new TypeError("userinfo data must be an object");
    }

    const userInfoKey = this.getUserInfoKey(key, providerId);
    const redis = await this.getClient();

    const pipeline = redis.multi();

    pipeline.hset(userInfoKey, data as Record<string, unknown>);
    pipeline.pexpire(userInfoKey, BaseStore.DefaultDataTTL);

    await pipeline.exec();
  }

  async getUserInfo(key: string, providerId: string): Promise<Record<string, unknown> | null> {
    const userInfoKey = this.getUserInfoKey(key, providerId);
    const redis = await this.getClient();

    const userInfo = await redis.hgetall(userInfoKey);

    if (Object.keys(userInfo).length === 0) return null;

    return userInfo;
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);
    const redis = await this.getClient();

    const pipeline = redis.multi();

    pipeline.del(groupsKey);

    if (groups.length > 0) {
      pipeline.rpush(groupsKey, ...groups);
      pipeline.pexpire(groupsKey, BaseStore.DefaultDataTTL);
    }

    await pipeline.exec();
  }

  async getUserGroups(key: string, providerId: string): Promise<string[] | null> {
    const groupsKey = this.getUserGroupsKey(key, providerId);
    const redis = await this.getClient();

    const groups = await redis.lrange(groupsKey, 0, -1);

    if (groups.length === 0) return null;

    return groups;
  }

  async setWebAuthnToken(key: string, token: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const redis = await this.getClient();

    await redis.set(tokenKey, token, "PX", this.ttl);
  }

  async getWebAuthnToken(key: string): Promise<string | null> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const redis = await this.getClient();

    return redis.get(tokenKey);
  }

  async takeWebAuthnToken(key: string, pendingToken: string): Promise<string | null> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const redis = await this.getClient();

    const response = await redis.eval(TAKE_WEB_AUTHN_TOKEN_SCRIPT, 1, tokenKey, pendingToken);

    if (typeof response !== "string") {
      return null;
    }

    return response;
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const redis = await this.getClient();

    await redis.del(tokenKey);
  }

  async close(): Promise<void> {
    let redis: RedisClient | Cluster | undefined;

    try {
      redis = this.redis ?? (await this.redisPromise);
    } catch {
      // initialization failed, nothing to disconnect
    }

    if (!redis) return;

    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }

    this.redis = undefined;
    this.redisPromise = undefined;
  }
}
