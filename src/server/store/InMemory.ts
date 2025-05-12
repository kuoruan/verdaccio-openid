import TTLCache from "@isaacs/ttlcache";

import { BaseStore, type InMemoryConfig, type Store } from "./Store";

const defaultOptions = {
  ttl: BaseStore.DefaultStateTTL,
} satisfies InMemoryConfig;

export default class InMemoryStore extends BaseStore implements Store {
  private readonly stateCache: TTLCache<string, string>;
  private readonly dataCache: TTLCache<string, any>;

  constructor(opts: InMemoryConfig = {}) {
    super();

    this.stateCache = new TTLCache({ ...defaultOptions, ...opts });
    this.dataCache = new TTLCache({ max: 2000, ttl: BaseStore.DefaultDataTTL });
  }

  setOpenIDState(key: string, nonce: string, providerId: string): void {
    const stateKey = this.getStateKey(key, providerId);

    this.stateCache.set(stateKey, nonce);
  }

  getOpenIDState(key: string, providerId: string): string | undefined {
    const stateKey = this.getStateKey(key, providerId);

    if (!this.stateCache.has(stateKey)) {
      return;
    }

    return this.stateCache.get(stateKey);
  }

  deleteOpenIDState(key: string, providerId: string): void {
    const stateKey = this.getStateKey(key, providerId);

    this.stateCache.delete(stateKey);
  }

  setUserInfo(key: string, data: unknown, providerId: string): void {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    this.dataCache.set(userInfoKey, data as Record<string, unknown>);
  }

  getUserInfo(key: string, providerId: string): Record<string, unknown> | undefined {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    if (!this.dataCache.has(userInfoKey)) {
      return;
    }

    return this.dataCache.get(userInfoKey);
  }

  setUserGroups(key: string, groups: string[], providerId: string): void {
    const userGroupsKey = this.getUserGroupsKey(key, providerId);

    this.dataCache.set(userGroupsKey, groups);
  }

  getUserGroups(key: string, providerId: string): string[] | undefined {
    const userGroupsKey = this.getUserGroupsKey(key, providerId);

    if (!this.dataCache.has(userGroupsKey)) {
      return undefined;
    }

    return this.dataCache.get(userGroupsKey);
  }

  setWebAuthnToken(key: string, token: string): void {
    const tokenKey = this.getWebAuthnTokenKey(key);

    this.stateCache.set(tokenKey, token);
  }

  getWebAuthnToken(key: string): string | undefined {
    const tokenKey = this.getWebAuthnTokenKey(key);

    if (!this.stateCache.has(tokenKey)) {
      return undefined;
    }
    return this.stateCache.get(tokenKey);
  }

  deleteWebAuthnToken(key: string): void {
    const tokenKey = this.getWebAuthnTokenKey(key);

    this.stateCache.delete(tokenKey);
  }

  close(): void {
    this.stateCache.clear();
    this.dataCache.clear();
  }
}
