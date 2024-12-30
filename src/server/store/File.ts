import storage, { type InitOptions, LocalStorage } from "node-persist";

import logger from "../logger";
import { BaseStore, type FileConfig, STATE_TTL, type Store, USER_GROUPS_CACHE_TTL, USER_INFO_CACHE_TTL } from "./Store";

const defaultOptions = {
  ttl: STATE_TTL,
  expiredInterval: STATE_TTL / 4,
} satisfies InitOptions;

export default class FileStore extends BaseStore implements Store {
  private readonly db: LocalStorage;

  constructor(opts: FileConfig) {
    super();

    const db = storage.create({
      ...defaultOptions,
      ...(typeof opts === "string" ? { dir: opts } : opts),
    });

    db.init().catch((e) => {
      logger.error({ message: e.message }, "Failed to initialize file store: @{message}");
    });

    this.db = db;
  }

  async setState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    await this.db.setItem(stateKey, nonce);
  }

  getState(key: string, providerId: string): Promise<string | undefined> {
    const stateKey = this.getStateKey(key, providerId);

    return this.db.getItem(stateKey);
  }

  async deleteState(key: string, providerId: string): Promise<void> {
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
}
