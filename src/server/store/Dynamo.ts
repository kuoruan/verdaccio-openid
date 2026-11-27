import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { DEFAULT_DATA_TTL_MS, DEFAULT_STATE_TTL_MS, PENDING_TOKEN, ROW_FIELD } from "./constants";
import logger from "@/server/logger";
import { importOptional } from "@/server/utils";
import { isUndefined } from "@/utils";

import { isDataKind, validateStoredValue } from "./utils";

import {
  BaseStore,
  type TakeKind,
  type DynamoConfig,
  type Store,
  type StoredValues,
  type StoreContext,
  type StoreKind,
} from "./Store";

const DEFAULT_PARTITION_KEY = "OIDC";

/**
 * Wraps an AWS SDK error so the Verdaccio plugin layer sees a small,
 * deterministic message — never the raw stack trace, which can be
 * huge and includes internal SDK paths.
 *
 * Only thrown from write paths (put, takeWebAuthn conditional
 * delete, takeLoginResult). Size checks throw from `validate`,
 * which the shared domain methods call before any hook; read paths
 * (get) fail closed by
 * returning undefined on backend errors, and
 * best-effort deletes (del) intentionally swallow errors since stale
 * rows expire via TTL anyway.
 */
class DynamoStoreError extends Error {
  constructor(op: string, cause: unknown) {
    const ce = cause as { name?: string; code?: string; message?: string } | undefined;
    const code = ce?.code ?? ce?.name ?? "unknown";
    super(`DynamoStore.${op} failed: ${code}`);
    this.name = "DynamoStoreError";
    if (cause instanceof Error) this.cause = cause;
  }
}

/** Transient errors are expected (DNS hiccup, throttling, brief
 *  endpoint flap). We still log them, but at warn — not error — to
 *  avoid alert fatigue. Caller decides whether to fail-open. */
const TRANSIENT_AWS_ERRORS = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "ProvisionedThroughputExceededException",
  "ThrottlingException",
  "InternalServerError",
  "ServiceUnavailable",
]);

function classify(err: unknown): "transient" | "permanent" {
  const code =
    (err as { code?: string; name?: string } | undefined)?.code ??
    (err as { code?: string; name?: string } | undefined)?.name;
  return code && TRANSIENT_AWS_ERRORS.has(code) ? "transient" : "permanent";
}

/**
 * DynamoDB-backed store for verdaccio-openid.
 *
 * ─── Threat model ────────────────────────────────────────────────────
 * Trust boundary: the Verdaccio process is trusted; the underlying
 * AWS account, IAM role, and table ACL are the security perimeter.
 *
 * Assumptions:
 *   1. The IAM role attached to the Verdaccio pod (via EKS Pod
 *      Identity / IRSA) is scoped to ONE specific table ARN with
 *      only the DynamoDB actions enumerated in the deployment's
 *      Pulumi config (GetItem/PutItem/DeleteItem/Query/Scan/Update
 *      + BatchGetItem/BatchWriteItem/DescribeTable). No cross-table
 *      access.
 *   2. Credentials are resolved through the standard AWS SDK
 *      provider chain — env vars, ~/.aws/credentials, container
 *      credentials. No static keys are ever stored in the Verdaccio
 *      config or passed as plugin options.
 *   3. TLS to DynamoDB is enforced by the AWS SDK by default
 *      (HTTPS-only public endpoint).
 *   4. User-controlled `key` parameters (e.g. session IDs, OIDC
 *      state nonces) are bounded in size by validateStoredValue() so a
 *      hostile client cannot blow the 400 KB DynamoDB item limit
 *      or run up the bill with pathological payloads.
 *
 * Schema (single-table design, intentionally compatible with
 * verdaccio-aws-s3-storage v12 which uses the same `pk`/`sk` schema —
 * namespacing is via the `pk` value, defaulting to "OIDC" here):
 *
 *   pk = "OIDC"                      (configurable via `partitionKey`)
 *   sk = "<providerId>:<type>:<key>" (matches BaseStore.rowKey())
 *
 * Item attributes vary by sk:
 *   state    → { nonce: string,        expires: epoch_seconds }
 *   userinfo → { data: { ... },        expires: epoch_seconds }
 *   groups   → { groups: string[],     expires: epoch_seconds }
 *   webauthn → { token: string,        expires: epoch_seconds }
 *   login    → { value: string,        expires: epoch_seconds }
 *
 * The table must have its `expires` attribute configured as the
 * TTL attribute name in the AWS DynamoDB console / Pulumi.
 *
 * Logging: transient errors are logged at warn and the rest at error,
 * never with nonces, tokens, or userinfo content. Read failures are
 * returned as undefined, writes and the conditional delete throw, and
 * best-effort deletes swallow, so the plugin layer fails closed and
 * forces a new login.
 */
export default class DynamoStore extends BaseStore implements Store {
  private readonly config: DynamoConfig;
  private readonly tableName: string;
  private readonly pk: string;
  private readonly stateTTLSeconds: number;
  private readonly dataTTLSeconds: number;
  private clientPromise?: Promise<DynamoDBDocumentClient>;

  constructor(opts?: DynamoConfig) {
    super();

    if (!opts?.tableName) {
      throw new Error("DynamoStore: `tableName` is required");
    }
    if (!opts.region) {
      throw new Error("DynamoStore: `region` is required");
    }

    this.config = opts;
    this.tableName = opts.tableName;
    this.pk = opts.partitionKey ?? DEFAULT_PARTITION_KEY;
    // DynamoDB TTL works in seconds, rounded up: `ttl: "500ms"` keeps its row
    // for a second instead of marking it expired on write.
    this.stateTTLSeconds = Math.ceil((typeof opts.ttl === "number" ? opts.ttl : DEFAULT_STATE_TTL_MS) / 1000);
    this.dataTTLSeconds = Math.ceil(DEFAULT_DATA_TTL_MS / 1000);
  }

  private async getClient(): Promise<DynamoDBDocumentClient> {
    this.clientPromise ??= (async () => {
      try {
        const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
          importOptional(
            import("@aws-sdk/client-dynamodb"),
            `store-type "dynamodb" requires the "@aws-sdk/client-dynamodb" package. Please install it first`,
          ),
          importOptional(
            import("@aws-sdk/lib-dynamodb"),
            `store-type "dynamodb" requires the "@aws-sdk/lib-dynamodb" package. Please install it first`,
          ),
        ]);

        const raw = new DynamoDBClient({ region: this.config.region });
        return DynamoDBDocumentClient.from(raw, {
          marshallOptions: { removeUndefinedValues: true },
        });
      } catch (err) {
        this.clientPromise = undefined;
        throw err;
      }
    })();

    return this.clientPromise;
  }

  private expiresAt(ttlSeconds: number): number {
    return Math.floor(Date.now() / 1000) + ttlSeconds;
  }

  protected override validate<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K] | undefined,
    _context?: StoreContext,
  ): void {
    validateStoredValue("DynamoStore", kind, key, value);
  }

  private async put(sk: string, item: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    try {
      const client = await this.getClient();
      const { PutCommand } = await import("@aws-sdk/lib-dynamodb");

      await client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: this.pk,
            sk,
            expires: this.expiresAt(ttlSeconds),
            ...item,
          },
        }),
      );
    } catch (err) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level](
        {
          error: (err as { name?: string })?.name ?? "unknown",
          code: (err as { code?: string })?.code,
        },
        "DynamoStore.put failed: @{error} (@{code})",
      );
      throw new DynamoStoreError("put", err);
    }
  }

  /** `isConsistent` is for read-after-write paths (state, webauthn, the
   *  login result, which is consumed exactly once); cache-style data
   *  (userinfo, groups) tolerates eventual reads at half the RCU cost. */
  private async get<T = Record<string, unknown>>(sk: string, isConsistent = false): Promise<T | undefined> {
    try {
      const client = await this.getClient();
      const { GetCommand } = await import("@aws-sdk/lib-dynamodb");

      const out = await client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
          ConsistentRead: isConsistent,
        }),
      );
      if (out.Item && typeof out.Item.expires === "number" && out.Item.expires * 1000 < Date.now()) {
        return undefined;
      }
      return out.Item as T | undefined;
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level]({ error: err?.name ?? "unknown", code: err?.code }, "DynamoStore.get failed: @{error} (@{code})");
      // Fail-closed reads: undefined forces the auth flow to re-issue
      // state rather than acting on stale / unavailable data.
      return undefined;
    }
  }

  private async del(sk: string): Promise<void> {
    try {
      const client = await this.getClient();
      const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");

      await client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
        }),
      );
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level]({ error: err?.name ?? "unknown", code: err?.code }, "DynamoStore.del failed: @{error} (@{code})");
      // Swallow on delete — a stale row will expire via TTL anyway,
      // and propagating here can break a logout flow without value.
    }
  }

  protected async read<K extends StoreKind>(
    kind: K,
    key: string,
    context?: StoreContext,
  ): Promise<StoredValues[K] | undefined> {
    // `state`, `webAuthn` and `loginResult` are read right after a write on
    // another connection, so they ask for a strongly consistent read.
    const consistent = !isDataKind(kind);
    const item = await this.get<Record<string, unknown>>(this.rowKey(kind, key, context), consistent);

    return item?.[ROW_FIELD[kind]] as StoredValues[K] | undefined;
  }

  protected async write<K extends StoreKind>(
    kind: K,
    key: string,
    value: StoredValues[K],
    context?: StoreContext,
  ): Promise<void> {
    // State-bound kinds keep the configured state TTL; cached userinfo keeps the data TTL.
    const ttl = isDataKind(kind) ? this.dataTTLSeconds : this.stateTTLSeconds;

    await this.put(this.rowKey(kind, key, context), { [ROW_FIELD[kind]]: value }, ttl);
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
   * delete so polling callers can keep checking; a ready session is
   * conditionally deleted — only the caller whose conditional delete
   * succeeds gets the value back. A lost race returns undefined,
   * preventing two callers from both believing they consumed the
   * same ready token.
   */

  private async takeWebAuthnValue(key: string, context?: StoreContext): Promise<string | undefined> {
    const sk = this.rowKey("webAuthn", key, context);
    const item = await this.get<{ token?: string }>(sk, true);
    const current = item?.token;
    if (isUndefined(current)) return undefined;
    if (current === PENDING_TOKEN) return current;

    try {
      const client = await this.getClient();
      const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");

      await client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
          ConditionExpression: "#t = :current",
          ExpressionAttributeNames: { "#t": "token" },
          ExpressionAttributeValues: { ":current": current },
        }),
      );
    } catch (err: any) {
      if (err?.name === "ConditionalCheckFailedException") {
        return undefined;
      }
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level](
        { error: err?.name, code: err?.code },
        "DynamoStore.takeWebAuthnSession delete failed: @{error} (@{code})",
      );
      throw new DynamoStoreError("takeWebAuthnSession", err);
    }
    return current;
  }

  /**
   * Read the login result and consume it in one atomic step.
   *
   * `DeleteItem` returns the item it removed, so of two requests presenting the
   * same code only one is handed the credentials. An expired row is reported as
   * absent: DynamoDB reaps it on its own schedule.
   */
  private async takeLoginResultValue(key: string, context?: StoreContext): Promise<string | undefined> {
    const sk = this.rowKey("loginResult", key, context);

    try {
      const client = await this.getClient();
      const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");

      const out = await client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
          ReturnValues: "ALL_OLD",
        }),
      );

      const item = out.Attributes as { value?: string; expires?: number } | undefined;

      if (!item) return undefined;
      if (typeof item.expires === "number" && item.expires * 1000 < Date.now()) return undefined;

      return item.value;
    } catch (err: any) {
      const level = classify(err) === "transient" ? "warn" : "error";
      logger[level](
        { error: err?.name ?? "unknown", code: err?.code },
        "DynamoStore.takeLoginResult failed: @{error} (@{code})",
      );
      throw new DynamoStoreError("takeLoginResult", err);
    }
  }

  async close(): Promise<void> {
    let client: DynamoDBDocumentClient | undefined;

    try {
      client = await this.clientPromise;
    } catch {
      // initialization failed, nothing to destroy
    }

    this.clientPromise = undefined;
    if (!client) return;

    client.destroy();
  }
}
