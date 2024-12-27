import type { Low } from "lowdb/lib";

import logger from "../logger";
import { BaseStore, type Store } from "./Store";

interface Data {
  state: Record<string, string>;
  userInfo: Record<string, Record<string, unknown>>;
  userGroups: Record<string, string[]>;
}

const defaultData = {
  state: {},
  userInfo: {},
  userGroups: {},
} satisfies Data;

export default class JsonFileStore extends BaseStore implements Store {
  private db!: Low<Data>;

  constructor(private readonly filePath: string) {
    super();

    void this.init();
  }

  private async init(): Promise<void> {
    try {
      const { JSONFilePreset } = await import("lowdb/node");

      const db = await JSONFilePreset<Data>(this.filePath, defaultData);
      this.db = db;
    } catch (e: any) {
      logger.error({ message: e.message }, "Could not initialize JSON file store: @{message}");

      process.exit(1);
    }
  }

  setState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    const state = this.db.data.state;

    state[stateKey] = nonce;

    return this.db.write();
  }

  getState(key: string, providerId: string): string | undefined {
    const stateKey = this.getStateKey(key, providerId);

    return this.db.data.state[stateKey];
  }

  deleteState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);

    delete this.db.data.state[stateKey];

    return this.db.write();
  }

  setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    const userInfo = this.db.data.userInfo;

    userInfo[userInfoKey] = data as Record<string, unknown>;

    return this.db.write();
  }

  getUserInfo(key: string, providerId: string): Record<string, unknown> {
    const userInfoKey = this.getUserInfoKey(key, providerId);

    return this.db.data.userInfo[userInfoKey];
  }

  setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    const userGroups = this.db.data.userGroups;

    userGroups[groupsKey] = groups;

    return this.db.write();
  }

  getUserGroups(key: string, providerId: string): string[] {
    const groupsKey = this.getUserGroupsKey(key, providerId);

    return this.db.data.userGroups[groupsKey];
  }
}
