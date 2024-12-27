import TTLCache from "@isaacs/ttlcache";

import { BaseStore, CACHE_TTL, type InMemoryConfig, STATE_TTL, type Store } from "./Store";

const defaultOptions = {
  ttl: STATE_TTL,
} satisfies InMemoryConfig;

export default class InMemoryStore extends BaseStore implements Store {
  private readonly stateCache: TTLCache<string, string>;
  private readonly userinfoCache: TTLCache<string, Record<string, unknown>>;
  private readonly groupsCache: TTLCache<string, string[]>;

  constructor(opts: InMemoryConfig = {}) {
    super();
    const { max, ttl } = { ...defaultOptions, ...opts };

    this.stateCache = new TTLCache({ max, ttl });
    this.userinfoCache = new TTLCache({ max: 1000, ttl: CACHE_TTL });
    this.groupsCache = new TTLCache({ max: 1000, ttl: CACHE_TTL });
  }

  setState(key: string, nonce: string, providerId: string): void {
    const stateKey = this.getStateKey(key, providerId);

    this.stateCache.set(stateKey, nonce);
  }

  getState(key: string, providerId: string): string | undefined {
    const stateKey = this.getStateKey(key, providerId);

    if (!this.stateCache.has(stateKey)) {
      return;
    }

    return this.stateCache.get(stateKey);
  }

  deleteState(key: string, providerId: string): void {
    const stateKey = this.getStateKey(key, providerId);

    this.stateCache.delete(stateKey);
  }

  setUserInfo(key: string, data: unknown, providerId: string): void {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    this.userinfoCache.set(userInfoKey, data as Record<string, unknown>);
  }

  getUserInfo(key: string, providerId: string): Record<string, unknown> | undefined {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    if (!this.userinfoCache.has(userInfoKey)) {
      return;
    }

    return this.userinfoCache.get(userInfoKey);
  }

  setUserGroups(key: string, groups: string[], providerId: string): void {
    const userGroupsKey = this.getUserGroupsKey(key, providerId);

    this.groupsCache.set(userGroupsKey, groups);
  }

  getUserGroups(key: string, providerId: string): string[] | undefined {
    const userGroupsKey = this.getUserGroupsKey(key, providerId);

    if (!this.groupsCache.has(userGroupsKey)) {
      return undefined;
    }

    return this.groupsCache.get(userGroupsKey);
  }
}
