import type { Cluster, Redis as RedisClient } from "ioredis";

import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS, PENDING_TOKEN } from "./constants";
import { importOptional } from "@/server/utils";
import { safeJsonParse } from "@/utils";

import {
  BaseStore,
  type TakeKind,
  type RedisClusterConfig,
  type RedisConfig,
  type Store,
  type StoreContext,
  type StoreKind,
  type StoredValues,
} from "./Store";

// Read the value and delete it in one step, so a second reader finds nothing.
const TAKE_LOGIN_RESULT_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then
  return false
end
redis.call("DEL", KEYS[1])
return value
`;

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

/** Store backed by Redis, so state and caches survive a restart and can be shared. */
export default class RedisStore extends BaseStore implements Store {
  private readonly ttl: number;
  private readonly config?: Omit<RedisConfig, "ttl"> | string;
  private redis?: RedisClient | Cluster;
  private redisPromise?: Promise<RedisClient | Cluster>;

  constructor(opts?: RedisConfig | string) {
    super();

    if (!!opts && typeof opts === "object") {
      const { ttl, ...config } = opts;
      this.config = config;
      this.ttl = ttl ?? DEFAULT_STATE_TTL_MS;
    } else {
      this.config = opts;
      this.ttl = DEFAULT_STATE_TTL_MS;
    }
  }

  private async getClient(): Promise<RedisClient | Cluster> {
    if (this.redis) return this.redis;

    this.redisPromise ??= (async () => {
      try {
        const { Cluster, Redis } = await importOptional(
          import("ioredis"),
          `store-type "redis" requires the "ioredis" package. Please install it first`,
        );

        if (!this.config) {
          this.redis = new Redis();
        } else if (typeof this.config === "string") {
          this.redis = new Redis(this.config);
        } else if (this.config?.nodes?.length) {
          const { nodes, username, password, redisOptions, ...restOpts } = this.config as Omit<
            RedisClusterConfig,
            "ttl"
          >;

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

  protected async read<K extends StoreKind>(
    kind: K,
    key: string,
    context?: StoreContext,
  ): Promise<StoredValues[K] | undefined> {
    const redis = await this.getClient();

    const rowKey = this.rowKey(kind, key, context);

    switch (kind) {
      case "state":
      case "webAuthn":
      case "loginResult":
        return ((await redis.get(rowKey)) ?? undefined) as StoredValues[K] | undefined;
      case "userInfo": {
        let raw: string | null;

        try {
          raw = await redis.get(rowKey);
        } catch (error: any) {
          // A hash written by an earlier version answers GET with WRONGTYPE. Treat it
          // as a miss, so the caller refetches and stores it in the current format.
          if (error?.message?.includes("WRONGTYPE")) {
            await redis.del(rowKey);

            return undefined;
          }

          throw error;
        }

        if (raw === null) return undefined;

        const parsed: unknown = safeJsonParse(raw);

        return (typeof parsed === "object" && parsed !== null ? parsed : undefined) as StoredValues[K] | undefined;
      }
      case "userGroups": {
        const groups = await redis.lrange(rowKey, 0, -1);

        if (groups.length === 0) return undefined;

        return groups as StoredValues[K];
      }
    }
  }

  protected async write<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): Promise<void> {
    const redis = await this.getClient();

    const rowKey = this.rowKey(kind, key, context);

    switch (kind) {
      case "state":
      case "webAuthn":
      case "loginResult":
        await redis.set(rowKey, value as string, "PX", this.ttl);
        return;
      case "userInfo":
        // JSON keeps the shape of the claims: a hash would stringify arrays and
        // nested objects, so the groups read back would no longer match.
        await redis.set(rowKey, JSON.stringify(value), "PX", DEFAULT_DATA_TTL_MS);
        return;
      case "userGroups": {
        const pipeline = redis.multi();

        pipeline.del(rowKey);
        pipeline.rpush(rowKey, ...(value as string[]));
        pipeline.pexpire(rowKey, DEFAULT_DATA_TTL_MS);

        await pipeline.exec();
        return;
      }
    }
  }

  protected async remove(kind: StoreKind, key: string, context?: StoreContext): Promise<void> {
    const redis = await this.getClient();

    await redis.del(this.rowKey(kind, key, context));
  }

  protected async take(kind: TakeKind, key: string, context?: StoreContext): Promise<string | undefined> {
    const redis = await this.getClient();

    let response: unknown;
    switch (kind) {
      case "webAuthn":
        response = await redis.eval(
          TAKE_WEB_AUTHN_TOKEN_SCRIPT,
          1,
          this.rowKey("webAuthn", key, context),
          PENDING_TOKEN,
        );
        break;
      case "loginResult":
        response = await redis.eval(TAKE_LOGIN_RESULT_SCRIPT, 1, this.rowKey("loginResult", key, context));
        break;
    }

    return typeof response === "string" ? response : undefined;
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
