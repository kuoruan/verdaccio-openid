import { chmod, mkdir } from "node:fs/promises";

import type { LocalStorage } from "node-persist";

import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS, PENDING_TOKEN } from "./constants";

import { importOptional, interopDefault } from "@/server/utils";
import logger from "@/server/logger";
import { isUndefOrNull } from "@/utils";

import {
  BaseStore,
  type TakeKind,
  type FileConfig,
  type Store,
  type StoredValues,
  type StoreContext,
  type StoreKind,
} from "./Store";

/** Store written to a directory with node-persist, so state and caches survive a restart. */
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
            `store-type "file" requires the "node-persist" package. Please install it first`,
          ),
        );

        const config = typeof this.config === "string" ? { dir: this.config } : this.config;

        // The directory holds the npm tokens of the users. Confine it to its
        // owner, so a file node-persist writes with the default mode stays out
        // of reach of everybody else. An existing directory is tightened too, as
        // it may have been created by an earlier version.
        await mkdir(config.dir, { recursive: true, mode: 0o700 }).catch(() => {
          // node-persist creates it, and reports the failure.
        });

        // Tighten a directory an earlier version created as 0755 too. A failure
        // is not fatal to the login, but it leaves the tokens world-readable, so
        // it must at least be visible in the log.
        await chmod(config.dir, 0o700).catch((error: any) => {
          logger.warn(
            { dir: config.dir, code: error?.code, message: error?.message ?? error },
            "FileStore: could not restrict the store directory @{dir}: @{code} (@{message})",
          );
        });

        const db = storage.create({
          // A truncated file (a crash mid-write) must not take the process down.
          forgiveParseErrors: true,
          ...config,
          ttl: config.ttl ?? DEFAULT_STATE_TTL_MS,
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

  protected async read<K extends StoreKind>(
    kind: K,
    key: string,
    context?: StoreContext,
  ): Promise<StoredValues[K] | undefined> {
    const db = await this.getDb();
    const rowKey = this.rowKey(kind, key, context);

    return ((await db.getItem(rowKey)) as StoredValues[K] | null) ?? undefined;
  }

  protected async write<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): Promise<void> {
    const db = await this.getDb();
    const rowKey = this.rowKey(kind, key, context);

    if (kind === "userInfo" || kind === "userGroups") {
      await db.setItem(rowKey, value, { ttl: DEFAULT_DATA_TTL_MS });
      return;
    }

    await db.setItem(rowKey, value);
  }

  protected async remove(kind: StoreKind, key: string, context?: StoreContext): Promise<void> {
    const db = await this.getDb();
    const rowKey = this.rowKey(kind, key, context);

    await db.removeItem(rowKey);
  }

  /**
   * Read the raw value of a consumable kind and delete it.
   *
   * This is a plain read followed by a delete: node-persist has no lock, so two
   * requests can both see the value. A pending webauthn row is reported
   * without delete. Use a backend that consumes in one operation when
   * duplicate delivery must be prevented (see docs/store-config.md).
   */
  protected async take(kind: TakeKind, key: string, context?: StoreContext): Promise<string | undefined> {
    const rowKey = this.rowKey(kind, key, context);
    const db = await this.getDb();

    const value = (await db.getItem(rowKey)) as string | null | undefined;

    switch (kind) {
      case "webAuthn":
        if (!isUndefOrNull(value) && value !== PENDING_TOKEN) {
          await db.removeItem(rowKey);
        }
        break;
      case "loginResult":
        if (!isUndefOrNull(value)) {
          await db.removeItem(rowKey);
        }
        break;
    }

    return value ?? undefined;
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
