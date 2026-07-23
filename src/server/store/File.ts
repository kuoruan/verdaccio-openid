import type { LocalStorage } from "node-persist";

import { BaseStore, type FileConfig, type Store } from "./Store";
import { importOptional, interopDefault } from "@/server/utils";

export default class FileStore extends BaseStore implements Store {
  private readonly config: FileConfig | string;
  private db?: LocalStorage;
  private dbPromise?: Promise<LocalStorage>;

  constructor(opts: FileConfig | string) {
    super();
    this.config = opts;
  }

  private async getDb(): Promise<LocalStorage> {
    if (this.db) return this.db;

    this.dbPromise ??= (async () => {
      try {
        const storage = await interopDefault(
          importOptional(
            import("node-persist"),
            `store-type "file" requires the "node-persist" package. Install it: npm add -g node-persist`,
          ),
        );

        const db = storage.create({
          ttl: BaseStore.DefaultStateTTL,
          ...(typeof this.config === "string" ? { dir: this.config } : this.config),
        });

        await db.init();
        this.db = db;
        return db;
      } catch (err) {
        this.dbPromise = undefined;
        throw err;
      }
    })();

    return this.dbPromise;
  }

  async setOpenIDState(key: string, nonce: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);
    const db = await this.getDb();

    await db.setItem(stateKey, nonce);
  }

  async getOpenIDState(key: string, providerId: string): Promise<string | undefined> {
    const stateKey = this.getStateKey(key, providerId);
    const db = await this.getDb();

    return db.getItem(stateKey);
  }

  async deleteOpenIDState(key: string, providerId: string): Promise<void> {
    const stateKey = this.getStateKey(key, providerId);
    const db = await this.getDb();

    await db.removeItem(stateKey);
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    if (typeof data !== "object" || data === null) {
      throw new TypeError("userinfo data must be an object");
    }

    const userInfoKey = this.getUserInfoKey(key, providerId);
    const db = await this.getDb();

    await db.setItem(userInfoKey, data, { ttl: BaseStore.DefaultDataTTL });
  }

  async getUserInfo(key: string, providerId: string): Promise<Record<string, unknown>> {
    const userInfoKey = this.getUserInfoKey(key, providerId);
    const db = await this.getDb();

    return db.getItem(userInfoKey);
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    const groupsKey = this.getUserGroupsKey(key, providerId);
    const db = await this.getDb();

    if (groups.length === 0) {
      await db.removeItem(groupsKey);
      return;
    }
    await db.setItem(groupsKey, groups, { ttl: BaseStore.DefaultDataTTL });
  }

  async getUserGroups(key: string, providerId: string): Promise<string[] | undefined> {
    const groupsKey = this.getUserGroupsKey(key, providerId);
    const db = await this.getDb();

    return db.getItem(groupsKey);
  }

  async setWebAuthnToken(key: string, token: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const db = await this.getDb();

    await db.setItem(tokenKey, token);
  }

  async getWebAuthnToken(key: string): Promise<string | null | undefined> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const db = await this.getDb();

    return db.getItem(tokenKey);
  }

  async takeWebAuthnToken(key: string, pendingToken: string): Promise<string | null | undefined> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const db = await this.getDb();

    const token = (await db.getItem(tokenKey)) as string | null | undefined;

    if (token && token !== pendingToken) {
      await db.removeItem(tokenKey);
    }

    return token;
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    const tokenKey = this.getWebAuthnTokenKey(key);
    const db = await this.getDb();

    await db.removeItem(tokenKey);
  }

  async close(): Promise<void> {
    try {
      await this.dbPromise;
    } catch {
      // initialization failed, nothing to clean up
    }
    this.db = undefined;
    this.dbPromise = undefined;
  }
}
