import process from "node:process";

import storage, { type InitOptions, LocalStorage } from "node-persist";

import logger from "@/server/logger";

import { BaseStore, type FileConfig, STATE_TTL, type Store, USER_GROUPS_CACHE_TTL, USER_INFO_CACHE_TTL } from "./Store";

const defaultOptions = {
  ttl: STATE_TTL,
} satisfies InitOptions;

export default class FileStore extends BaseStore implements Store {
  private readonly db: LocalStorage;

  constructor(opts: FileConfig | string) {
    super();

    const db = storage.create({
      ...defaultOptions,
      ...(typeof opts === "string" ? { dir: opts } : opts),
    });

    db.init().catch((e) => {
      logger.error({ message: e.message }, "Failed to initialize file store: @{message}");
      process.exit(1);
    });

    this.db = db;
  }

  async setOpenIDState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.db.setItem(stateKey, nonce);
  }

  getOpenIDState(key: string, providerId: string): Promise<string | undefined> {
    const stateKey = this.getStateKey(key, providerId);

    return this.db.getItem(stateKey);
  }

  async deleteOpenIDState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.db.removeItem(stateKey);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    await this.db.setItem(userInfoKey, data, { ttl: USER_INFO_CACHE_TTL });
  }

  getUserInfo(key: string, providerId: string): Promise<Record<string, unknown>> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    return this.db.getItem(userInfoKey);
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    await this.db.setItem(groupsKey, groups, { ttl: USER_GROUPS_CACHE_TTL });
  }

  getUserGroups(key: string, providerId: string): Promise<string[] | undefined> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    return this.db.getItem(groupsKey);
  }

  async setWebAuthnToken(key: string, token: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    await this.db.setItem(tokenKey, token);
  }

  getWebAuthnToken(key: string): Promise<string | null | undefined> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    return this.db.getItem(tokenKey);
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);

    await this.db.removeItem(tokenKey);
  }

  close(): void {
    // ignore
  }
}
