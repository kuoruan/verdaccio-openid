import type { Cluster, Redis as RedisClient } from "ioredis";

import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS, PENDING_TOKEN } from "./constants";
import { importOptional } from "@/server/utils";
import { isNull, isObject, isPlainObject, safeJsonParse } from "@/utils";

import { isDataKind } from "./utils";

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

/**
 * Read a consumable row and delete it in one step. `ARGV[1]` is the value to keep;
 * with no ARGV every string read is consumed.
 */
const TAKE_VALUE_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if value and value ~= ARGV[1] then
  redis.call("DEL", KEYS[1])
end
return value
`;

type RedisConnection = RedisClient | Cluster;

type RedisCodec = {
  read: (redis: RedisConnection, rowKey: string) => Promise<unknown>;
  write: (redis: RedisConnection, rowKey: string, value: unknown, ttl: number) => Promise<void>;
};

async function readString(redis: RedisConnection, rowKey: string): Promise<string | undefined> {
  return (await redis.get(rowKey)) ?? undefined;
}

function writeString(redis: RedisConnection, rowKey: string, value: unknown, ttl: number): Promise<void> {
  // ioredis answers SET with `"OK" | null`, which is not a `Promise<void>`.
  return redis.set(rowKey, value as string, "PX", ttl).then(() => {});
}

const REDIS_CODECS: Record<StoreKind, RedisCodec> = {
  state: { read: readString, write: writeString },
  webAuthn: { read: readString, write: writeString },
  loginResult: { read: readString, write: writeString },
  userInfo: {
    read: async (redis, rowKey) => {
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

      if (isNull(raw)) return undefined;

      const parsed: unknown = safeJsonParse(raw);

      return isPlainObject(parsed) ? parsed : undefined;
    },
    // JSON keeps the shape of the claims: a hash would stringify arrays and
    // nested objects, so the groups read back would no longer match.
    write: (redis, rowKey, value, ttl) => writeString(redis, rowKey, JSON.stringify(value), ttl),
  },
  userGroups: {
    read: async (redis, rowKey) => {
      const groups = await redis.lrange(rowKey, 0, -1);

      return groups.length === 0 ? undefined : groups;
    },
    write: async (redis, rowKey, value, ttl) => {
      const pipeline = redis.multi();

      pipeline.del(rowKey);
      pipeline.rpush(rowKey, ...(value as string[]));
      pipeline.pexpire(rowKey, ttl);

      await pipeline.exec();
    },
  },
};

/** Store backed by Redis, so state and caches survive a restart and can be shared. */
export default class RedisStore extends BaseStore implements Store {
  private readonly ttl: number;
  private readonly config?: Omit<RedisConfig, "ttl"> | string;
  private redisPromise?: Promise<RedisConnection>;

  constructor(opts?: RedisConfig | string) {
    super();

    if (isObject(opts)) {
      const { ttl, ...config } = opts;
      this.config = config;
      this.ttl = ttl ?? DEFAULT_STATE_TTL_MS;
    } else {
      this.config = opts;
      this.ttl = DEFAULT_STATE_TTL_MS;
    }
  }

  private async getClient(): Promise<RedisConnection> {
    this.redisPromise ??= (async () => {
      try {
        const { Cluster, Redis } = await importOptional(
          import("ioredis"),
          `store-type "redis" requires the "ioredis" package. Please install it first`,
        );

        if (!this.config) {
          return new Redis();
        }
        if (typeof this.config === "string") {
          return new Redis(this.config);
        }
        if (this.config?.nodes?.length) {
          const { nodes, username, password, redisOptions, ...restOpts } = this.config as Omit<
            RedisClusterConfig,
            "ttl"
          >;

          return new Cluster(nodes, {
            redisOptions: { username, password, ...redisOptions },
            ...restOpts,
          });
        }
        return new Redis(this.config);
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

    return (await REDIS_CODECS[kind].read(redis, rowKey)) as StoredValues[K] | undefined;
  }

  protected async write<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): Promise<void> {
    const redis = await this.getClient();
    const rowKey = this.rowKey(kind, key, context);
    const ttl = isDataKind(kind) ? DEFAULT_DATA_TTL_MS : this.ttl;

    await REDIS_CODECS[kind].write(redis, rowKey, value, ttl);
  }

  protected async remove(kind: StoreKind, key: string, context?: StoreContext): Promise<void> {
    const redis = await this.getClient();

    await redis.del(this.rowKey(kind, key, context));
  }

  protected async take(kind: TakeKind, key: string, context?: StoreContext): Promise<string | undefined> {
    const redis = await this.getClient();

    const keep = kind === "webAuthn" ? [PENDING_TOKEN] : [];

    const response = await redis.eval(TAKE_VALUE_SCRIPT, 1, this.rowKey(kind, key, context), ...keep);

    return typeof response === "string" ? response : undefined;
  }

  async close(): Promise<void> {
    let redis: RedisConnection | undefined;

    try {
      redis = await this.redisPromise;
    } catch {
      // initialization failed, nothing to disconnect
    }

    this.redisPromise = undefined;
    if (!redis) return;

    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}
