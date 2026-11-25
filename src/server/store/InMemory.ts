import { TTLCache } from "@isaacs/ttlcache";

import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS, PENDING_TOKEN } from "./constants";

import {
  BaseStore,
  type TakeKind,
  type InMemoryConfig,
  type Store,
  type StoredValues,
  type StoreContext,
  type StoreKind,
} from "./Store";

/** Store kept in the Verdaccio process: state and caches are lost on restart. */
export default class InMemoryStore extends BaseStore implements Store {
  private readonly stateCache: TTLCache<string, string>;
  private readonly dataCache: TTLCache<string, Record<string, unknown> | string[]>;

  constructor(opts: InMemoryConfig = {}) {
    super();

    // `ttl: undefined` would make every `set` throw, so an unset value must not
    // reach the cache.
    this.stateCache = new TTLCache({ ...opts, ttl: opts.ttl ?? DEFAULT_STATE_TTL_MS });
    this.dataCache = new TTLCache({ max: 2000, ttl: DEFAULT_DATA_TTL_MS });
  }

  protected read<K extends StoreKind>(kind: K, key: string, context?: StoreContext): StoredValues[K] | undefined {
    // A missing or expired row is already `undefined` from `get`.
    return this.cacheFor(kind).get(this.rowKey(kind, key, context)) as StoredValues[K] | undefined;
  }

  protected write<K extends StoreKind>(kind: K, key: string, value: StoredValues[K], context?: StoreContext): void {
    this.cacheFor(kind).set(this.rowKey(kind, key, context), value);
  }

  protected remove(kind: StoreKind, key: string, context?: StoreContext): void {
    this.cacheFor(kind).delete(this.rowKey(kind, key, context));
  }

  protected take(kind: TakeKind, key: string, context?: StoreContext): string | undefined {
    const rowKey = this.rowKey(kind, key, context);
    const cache = this.cacheFor(kind);
    const value = cache.get(rowKey);

    if (value === undefined) {
      return undefined;
    }

    // Nothing can interleave here: no await between the read and the
    // delete, so the cache is read and cleared in one turn. A pending
    // webauthn row is reported without delete.
    if (!(kind === "webAuthn" && value === PENDING_TOKEN)) {
      cache.delete(rowKey);
    }

    return value;
  }

  close(): void {
    this.stateCache.clear();
    this.dataCache.clear();
  }

  /** The cache that holds the rows of this kind. */
  private cacheFor(kind: StoreKind): TTLCache<any, any> {
    switch (kind) {
      case "userInfo":
      case "userGroups":
        return this.dataCache;
      case "state":
      case "webAuthn":
      case "loginResult":
        return this.stateCache;
    }
  }
}
