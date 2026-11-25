import type { Collection, MongoClient } from "mongodb";

import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS, PENDING_TOKEN, ROW_FIELD } from "./constants";
import logger from "@/server/logger";
import { importOptional } from "@/server/utils";
import { isUndefined } from "@/utils";

import { validateStoredValue } from "./utils";

import {
  BaseStore,
  type TakeKind,
  type MongoConfig,
  type Store,
  type StoredValues,
  type StoreContext,
  type StoreKind,
} from "./Store";

const DEFAULT_DATABASE = "verdaccio-openid";
const DEFAULT_COLLECTION = "openid-store";
const TTL_INDEX_NAME = "expiresAt_ttl";

/** Captures the database segment of a connection string, if it has one. */
const URI_DATABASE_REGEX = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/;

/**
 * Wraps a driver error so the Verdaccio plugin layer sees a small,
 * deterministic message — never the raw error, which may embed the
 * connection string or the document being written.
 *
 * Only thrown from write paths (put, takeWebAuthn conditional
 * delete, takeLoginResult). Size checks throw from `validate`,
 * which the shared domain methods call before any hook; read paths
 * fail closed by returning
 * undefined on backend errors, and
 * best-effort deletes swallow errors since stale documents expire via
 * the TTL index anyway.
 */
class MongoStoreError extends Error {
  constructor(op: string, cause: unknown) {
    const ce = cause as { name?: string; code?: number | string } | undefined;
    const code = ce?.code ?? ce?.name ?? "unknown";
    super(`MongoStore.${op} failed: ${String(code)}`);
    this.name = "MongoStoreError";
    if (cause instanceof Error) this.cause = cause;
  }
}

/** Transient errors are expected (network flap, primary election,
 *  throttling). We still log them, but at warn — not error — to avoid
 *  alert fatigue. */
const TRANSIENT_ERROR_NAMES = new Set([
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongoTopologyClosedError",
  "MongoWriteConcernError",
]);

const TRANSIENT_ERROR_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  262, // ExceededTimeLimit
  16_500, // Request rate is too large (Azure Cosmos DB throttling)
]);

function classify(err: unknown): "transient" | "permanent" {
  const e = err as { name?: string; code?: number | string; hasErrorLabel?: (label: string) => boolean } | undefined;

  if (!e) return "permanent";
  if (e.name && TRANSIENT_ERROR_NAMES.has(e.name)) return "transient";
  if (typeof e.code === "number" && TRANSIENT_ERROR_CODES.has(e.code)) return "transient";
  if (typeof e.hasErrorLabel === "function" && e.hasErrorLabel("RetryableWriteError")) return "transient";

  return "permanent";
}

interface StoreDocument {
  _id: string;
  nonce?: string;
  data?: Record<string, unknown>;
  groups?: string[];
  token?: string;
  value?: string;
  expiresAt: Date;
}

type DocumentFields = Omit<StoreDocument, "_id" | "expiresAt">;

/**
 * MongoDB-backed store for verdaccio-openid.
 *
 * Works against any MongoDB 4.0+ compatible deployment (self-hosted,
 * Atlas, Azure Cosmos DB for MongoDB vCore, Amazon DocumentDB): all the
 * store needs is plain CRUD on a single collection plus a TTL index.
 *
 * Schema (one collection, one document per key):
 *
 *   _id       = "<providerId>:<type>:<key>"  (matches BaseStore.rowKey())
 *   expiresAt = Date                          (TTL index, expireAfterSeconds: 0)
 *
 * The remaining fields vary by type:
 *   state    → { nonce: string }
 *   userinfo → { data: { ... } }
 *   groups   → { groups: string[] }
 *   webauthn → { token: string }
 *   login    → { value: string }
 *
 * Expiry is enforced on read (`expiresAt > now`). The MongoDB TTL monitor
 * only removes expired documents about once a minute, so the index is
 * treated as garbage collection rather than as the source of truth.
 *
 * Credentials travel in the connection string only — keep it in an
 * environment variable (see docs/environment-variables.md), never in the
 * Verdaccio config file.
 *
 * Logging: errors are logged without nonces, tokens or userinfo content.
 */
export default class MongoStore extends BaseStore implements Store {
  private readonly config: MongoConfig;
  private readonly databaseName: string;
  private readonly collectionName: string;
  private readonly stateTTL: number;
  private readonly dataTTL: number;
  private client?: MongoClient;
  private collection?: Collection<StoreDocument>;
  private collectionPromise?: Promise<Collection<StoreDocument>>;

  constructor(opts: MongoConfig) {
    super();

    if (!opts?.uri) {
      throw new Error("MongoStore: `uri` is required");
    }

    this.config = opts;
    this.databaseName = opts.database ?? MongoStore.databaseFromUri(opts.uri) ?? DEFAULT_DATABASE;
    this.collectionName = opts.collection ?? DEFAULT_COLLECTION;
    this.stateTTL = typeof opts.ttl === "number" ? opts.ttl : DEFAULT_STATE_TTL_MS;
    this.dataTTL = DEFAULT_DATA_TTL_MS;
  }

  private static databaseFromUri(uri: string): string | undefined {
    const match = URI_DATABASE_REGEX.exec(uri);
    if (!match) return undefined;

    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  private async getCollection(): Promise<Collection<StoreDocument>> {
    if (this.collection) return this.collection;

    this.collectionPromise ??= (async () => {
      try {
        const { MongoClient } = await importOptional(
          import("mongodb"),
          `store-type "mongodb" requires the "mongodb" package. Please install it first`,
        );

        const client = new MongoClient(this.config.uri);

        try {
          await client.connect();

          const collection = client.db(this.databaseName).collection<StoreDocument>(this.collectionName);

          await this.ensureTTLIndex(collection);

          this.client = client;
          this.collection = collection;

          return collection;
        } catch (err) {
          await client.close().catch(() => undefined);
          throw err;
        }
      } catch (err) {
        this.collectionPromise = undefined;
        throw err;
      }
    })();

    return this.collectionPromise;
  }

  /**
   * The TTL index lets MongoDB garbage-collect expired documents. Failing
   * to create it (a read-only role, a server without TTL support) is not
   * fatal — reads filter on `expiresAt` anyway — so log and carry on.
   */
  private async ensureTTLIndex(collection: Collection<StoreDocument>): Promise<void> {
    try {
      await collection.createIndex({ expiresAt: 1 }, { name: TTL_INDEX_NAME, expireAfterSeconds: 0 });
    } catch (err: any) {
      logger.warn(
        { error: err?.name ?? "unknown", code: err?.code },
        "MongoStore: could not create the TTL index, expired documents will not be garbage-collected: @{error} (@{code})",
      );
    }
  }

  private expiresAt(ttl: number): Date {
    return new Date(Date.now() + ttl);
  }

  protected override validate<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K] | undefined,
    _context?: StoreContext,
  ): void {
    validateStoredValue("MongoStore", kind, key, value);
  }

  private async put(_id: string, fields: DocumentFields, ttl: number): Promise<void> {
    try {
      const collection = await this.getCollection();

      // On upsert the driver takes `_id` from the equality filter.
      await collection.replaceOne({ _id }, { ...fields, expiresAt: this.expiresAt(ttl) }, { upsert: true });
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level]({ error: err?.name ?? "unknown", code: err?.code }, "MongoStore.put failed: @{error} (@{code})");
      throw new MongoStoreError("put", err);
    }
  }

  private async get(_id: string): Promise<StoreDocument | undefined> {
    try {
      const collection = await this.getCollection();

      const doc = await collection.findOne({ _id, expiresAt: { $gt: new Date() } });

      return doc ?? undefined;
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level]({ error: err?.name ?? "unknown", code: err?.code }, "MongoStore.get failed: @{error} (@{code})");
      // Fail-closed reads: undefined forces the auth flow to re-issue
      // state rather than acting on stale / unavailable data.
      return undefined;
    }
  }

  private async del(_id: string): Promise<void> {
    try {
      const collection = await this.getCollection();

      await collection.deleteOne({ _id });
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level]({ error: err?.name ?? "unknown", code: err?.code }, "MongoStore.del failed: @{error} (@{code})");
      // Swallow on delete — a stale document expires via the TTL index
      // anyway, and propagating here can break a logout flow without value.
    }
  }

  protected async read<K extends StoreKind>(
    kind: K,
    key: string,
    context?: StoreContext,
  ): Promise<StoredValues[K] | undefined> {
    const doc = await this.get(this.rowKey(kind, key, context));

    return doc?.[ROW_FIELD[kind]] as StoredValues[K] | undefined;
  }

  protected async write<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): Promise<void> {
    // State-bound kinds keep the configured state TTL; cached userinfo keeps the data TTL.
    const ttl = kind === "userInfo" || kind === "userGroups" ? this.dataTTL : this.stateTTL;

    await this.put(this.rowKey(kind, key, context), { [ROW_FIELD[kind]]: value } as DocumentFields, ttl);
  }

  protected async remove(kind: StoreKind, key: string, context?: StoreContext): Promise<void> {
    await this.del(this.rowKey(kind, key, context));
  }

  /** Dispatch an atomic take to the kind's own single-step operation. */
  protected async take(kind: TakeKind, key: string, context?: StoreContext): Promise<string | undefined> {
    switch (kind) {
      case "webAuthn":
        return this.takeWebAuthnValue(key, context);
      case "loginResult":
        return this.takeLoginResultValue(key, context);
    }
  }

  /**
   * Atomically read the webauthn session and consume it if ready.
   *
   * Mirrors the Redis Lua semantics: a pending session is returned without
   * delete so polling callers can keep checking; a ready session is deleted
   * with the token value in the filter,
   * so only the caller whose delete actually matched gets the value back.
   * A lost race returns undefined, preventing two callers from both
   * believing they consumed the same token.
   */
  private async takeWebAuthnValue(key: string, context?: StoreContext): Promise<string | undefined> {
    const _id = this.rowKey("webAuthn", key, context);
    const current = (await this.get(_id))?.token;

    if (isUndefined(current)) return undefined;
    if (current === PENDING_TOKEN) return current;

    try {
      const collection = await this.getCollection();

      const { deletedCount } = await collection.deleteOne({ _id, token: current });

      return deletedCount === 1 ? current : undefined;
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level](
        { error: err?.name ?? "unknown", code: err?.code },
        "MongoStore.takeWebAuthnSession delete failed: @{error} (@{code})",
      );
      throw new MongoStoreError("takeWebAuthnSession", err);
    }
  }

  /**
   * Read the login result and consume it in one atomic step.
   *
   * `findOneAndDelete` matches and deletes the same document, so of two
   * requests presenting the same code only one is handed the credentials.
   */
  private async takeLoginResultValue(key: string, context?: StoreContext): Promise<string | undefined> {
    const _id = this.rowKey("loginResult", key, context);

    try {
      const collection = await this.getCollection();

      const doc = await collection.findOneAndDelete({ _id, expiresAt: { $gt: new Date() } });

      return doc?.value ?? undefined;
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level](
        { error: err?.name ?? "unknown", code: err?.code },
        "MongoStore.takeLoginResult failed: @{error} (@{code})",
      );
      throw new MongoStoreError("takeLoginResult", err);
    }
  }

  async close(): Promise<void> {
    try {
      await this.collectionPromise;
    } catch {
      // initialization failed, nothing to close
    }

    const client = this.client;

    this.client = undefined;
    this.collection = undefined;
    this.collectionPromise = undefined;

    if (!client) return;

    await client.close();
  }
}
