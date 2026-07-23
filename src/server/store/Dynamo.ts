import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import logger from "@/server/logger";
import { importOptional } from "@/server/utils";

import { BaseStore, type DynamoConfig, type Store } from "./Store";

const DEFAULT_PARTITION_KEY = "OIDC";

// DynamoDB item size limit is 400 KB; we cap user-controlled inputs
// well below that as a defence-in-depth measure against pathological
// payloads from a malicious client.
const MAX_KEY_BYTES = 1024;
const MAX_VALUE_BYTES = 64 * 1024; // 64 KB — far above any realistic
// OIDC nonce / token / userinfo payload
// we'd ever see.

function assertSize(label: string, value: string, max: number): void {
  if (Buffer.byteLength(value, "utf8") > max) {
    throw new Error(`DynamoStore: ${label} exceeds ${max} byte limit`);
  }
}

/**
 * Wraps an AWS SDK error so the verdaccio plugin layer sees a small,
 * deterministic message — never the raw stack trace, which can be
 * huge and includes internal SDK paths.
 *
 * Only thrown from write paths (put, takeWebAuthnToken conditional
 * delete). Read paths (get) fail closed by returning undefined, and
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
 * Trust boundary: the verdaccio process is trusted; the underlying
 * AWS account, IAM role, and table ACL are the security perimeter.
 *
 * Assumptions:
 *   1. The IAM role attached to the verdaccio pod (via EKS Pod
 *      Identity / IRSA) is scoped to ONE specific table ARN with
 *      only the DynamoDB actions enumerated in the deployment's
 *      Pulumi config (GetItem/PutItem/DeleteItem/Query/Scan/Update
 *      + BatchGetItem/BatchWriteItem/DescribeTable). No cross-table
 *      access.
 *   2. Credentials are resolved through the standard AWS SDK
 *      provider chain — env vars, ~/.aws/credentials, container
 *      credentials. No static keys are ever stored in the verdaccio
 *      config or passed as plugin options.
 *   3. TLS to DynamoDB is enforced by the AWS SDK by default
 *      (HTTPS-only public endpoint).
 *   4. User-controlled `key` parameters (e.g. session IDs, OIDC
 *      state nonces) are bounded in size by assertSize() so a
 *      hostile client cannot blow the 400 KB DynamoDB item limit
 *      or run up the bill with pathological payloads.
 *
 * Schema (single-table design, intentionally compatible with
 * verdaccio-aws-s3-storage v12 which uses the same `pk`/`sk` schema —
 * namespacing is via the `pk` value, defaulting to "OIDC" here):
 *
 *   pk = "OIDC"                      (configurable via `partitionKey`)
 *   sk = "<providerId>:<type>:<key>" (matches BaseStore.get*Key())
 *
 * Item attributes vary by sk:
 *   state    → { nonce: string,        expires: epoch_seconds }
 *   userinfo → { data: { ... },        expires: epoch_seconds }
 *   groups   → { groups: string[],     expires: epoch_seconds }
 *   webauthn → { token: string,        expires: epoch_seconds }
 *
 * The table must have its `expires` attribute configured as the
 * TTL attribute name in the AWS DynamoDB console / Pulumi.
 *
 * Logging: errors are caught and logged at debug level; we never log
 * nonces, tokens, or userinfo content. Failures are returned as
 * undefined to the plugin layer, which fails closed (forces re-auth).
 */
export default class DynamoStore extends BaseStore implements Store {
  private readonly config: DynamoConfig;
  private readonly tableName: string;
  private readonly pk: string;
  private readonly stateTTLSeconds: number;
  private readonly dataTTLSeconds: number;
  private client?: DynamoDBDocumentClient;
  private clientPromise?: Promise<DynamoDBDocumentClient>;

  constructor(opts: DynamoConfig) {
    super();

    if (!opts.tableName) {
      throw new Error("DynamoStore: `tableName` is required");
    }
    if (!opts.region) {
      throw new Error("DynamoStore: `region` is required");
    }

    this.config = opts;
    this.tableName = opts.tableName;
    this.pk = opts.partitionKey ?? DEFAULT_PARTITION_KEY;
    this.stateTTLSeconds = Math.floor((typeof opts.ttl === "number" ? opts.ttl : BaseStore.DefaultStateTTL) / 1000);
    this.dataTTLSeconds = Math.floor(BaseStore.DefaultDataTTL / 1000);
  }

  private async getClient(): Promise<DynamoDBDocumentClient> {
    if (this.client) return this.client;

    this.clientPromise ??= (async () => {
      try {
        const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
          importOptional(
            import("@aws-sdk/client-dynamodb"),
            `store-type "dynamodb" requires the "@aws-sdk/client-dynamodb" package. Install it: npm add -g @aws-sdk/client-dynamodb`,
          ),
          importOptional(
            import("@aws-sdk/lib-dynamodb"),
            `store-type "dynamodb" requires the "@aws-sdk/lib-dynamodb" package. Install it: npm add -g @aws-sdk/lib-dynamodb`,
          ),
        ]);

        const raw = new DynamoDBClient({ region: this.config.region });
        this.client = DynamoDBDocumentClient.from(raw, {
          marshallOptions: { removeUndefinedValues: true },
        });
        return this.client;
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

  private async get<T = Record<string, unknown>>(sk: string): Promise<T | undefined> {
    try {
      const client = await this.getClient();
      const { GetCommand } = await import("@aws-sdk/lib-dynamodb");

      const out = await client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
          ConsistentRead: true,
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

  async setOpenIDState(key: string, nonce: string, providerId: string): Promise<void> {
    assertSize("openid state key", key, MAX_KEY_BYTES);
    assertSize("openid state nonce", nonce, MAX_VALUE_BYTES);
    await this.put(this.getStateKey(key, providerId), { nonce }, this.stateTTLSeconds);
  }

  async getOpenIDState(key: string, providerId: string): Promise<string | undefined> {
    const item = await this.get<{ nonce?: string }>(this.getStateKey(key, providerId));
    return item?.nonce;
  }

  async deleteOpenIDState(key: string, providerId: string): Promise<void> {
    await this.del(this.getStateKey(key, providerId));
  }

  async setUserInfo(key: string, data: unknown, providerId: string): Promise<void> {
    if (typeof data !== "object" || data === null) {
      throw new TypeError("userinfo data must be an object");
    }

    assertSize("user info key", key, MAX_KEY_BYTES);
    assertSize("user info payload", JSON.stringify(data), MAX_VALUE_BYTES);
    await this.put(
      this.getUserInfoKey(key, providerId),
      { data: data as Record<string, unknown> },
      this.dataTTLSeconds,
    );
  }

  async getUserInfo(key: string, providerId: string): Promise<Record<string, unknown> | undefined> {
    const item = await this.get<{ data?: Record<string, unknown> }>(this.getUserInfoKey(key, providerId));
    return item?.data;
  }

  async setUserGroups(key: string, groups: string[], providerId: string): Promise<void> {
    assertSize("user groups key", key, MAX_KEY_BYTES);
    assertSize("user groups payload", JSON.stringify(groups), MAX_VALUE_BYTES);
    if (groups.length === 0) {
      await this.del(this.getUserGroupsKey(key, providerId));
      return;
    }
    await this.put(this.getUserGroupsKey(key, providerId), { groups }, this.dataTTLSeconds);
  }

  async getUserGroups(key: string, providerId: string): Promise<string[] | undefined> {
    const item = await this.get<{ groups?: string[] }>(this.getUserGroupsKey(key, providerId));
    return item?.groups;
  }

  async setWebAuthnToken(key: string, token: string): Promise<void> {
    assertSize("webauthn key", key, MAX_KEY_BYTES);
    assertSize("webauthn token", token, MAX_VALUE_BYTES);
    await this.put(this.getWebAuthnTokenKey(key), { token }, this.stateTTLSeconds);
  }

  async getWebAuthnToken(key: string): Promise<string | undefined> {
    const item = await this.get<{ token?: string }>(this.getWebAuthnTokenKey(key));
    return item?.token;
  }

  /**
   * Atomically read the webauthn token and consume it if ready.
   *
   * Mirrors the Redis Lua semantics: pending tokens (current ===
   * pendingToken) are returned without delete so polling callers can
   * keep checking; ready tokens (current !== pendingToken) are
   * conditionally deleted — only the caller whose conditional delete
   * succeeds gets the value back. A lost race returns undefined,
   * preventing two callers from both believing they consumed the
   * same ready token.
   */
  async takeWebAuthnToken(key: string, pendingToken: string): Promise<string | undefined> {
    const sk = this.getWebAuthnTokenKey(key);
    const item = await this.get<{ token?: string }>(sk);
    const current = item?.token;
    if (current === undefined) return undefined;
    if (current === pendingToken) return current;

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
        "DynamoStore.takeWebAuthnToken delete failed: @{error} (@{code})",
      );
      throw new DynamoStoreError("takeWebAuthnToken", err);
    }
    return current;
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    await this.del(this.getWebAuthnTokenKey(key));
  }

  async close(): Promise<void> {
    let client: DynamoDBDocumentClient | undefined;

    try {
      client = this.client ?? (await this.clientPromise);
    } catch {
      // initialization failed, nothing to destroy
    }

    if (!client) return;

    client.destroy();
    this.client = undefined;
    this.clientPromise = undefined;
  }
}
