import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import logger from "@/server/logger";

import { BaseStore, type DynamoConfig, type Store } from "./Store";

const DEFAULT_PARTITION_KEY = "OIDC";

// DynamoDB item size limit is 400 KB; keys must fit within that. We
// cap user-controlled inputs WAY below that to bound the blast radius
// of a malicious client sending pathological values.
const MAX_KEY_BYTES = 1024; // DynamoDB attribute name/value limit
const MAX_VALUE_BYTES = 64 * 1024; // 64 KB — far above any realistic
// OIDC nonce / token / userinfo payload
// we'd ever see.

function assertSize(label: string, value: string, max: number): void {
  if (Buffer.byteLength(value, "utf8") > max) {
    throw new Error(`DynamoStore: ${label} exceeds ${max} byte limit`);
  }
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
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly pk: string;
  private readonly stateTTLSeconds: number;
  private readonly dataTTLSeconds: number;

  constructor(opts: DynamoConfig) {
    super();

    if (!opts.tableName) {
      throw new Error("DynamoStore: `tableName` is required");
    }
    if (!opts.region) {
      throw new Error("DynamoStore: `region` is required");
    }

    const raw = new DynamoDBClient({ region: opts.region });
    this.client = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });

    this.tableName = opts.tableName;
    this.pk = opts.partitionKey ?? DEFAULT_PARTITION_KEY;
    this.stateTTLSeconds = Math.floor((typeof opts.ttl === "number" ? opts.ttl : BaseStore.DefaultStateTTL) / 1000);
    this.dataTTLSeconds = Math.floor(BaseStore.DefaultDataTTL / 1000);
  }

  private expiresAt(ttlSeconds: number): number {
    return Math.floor(Date.now() / 1000) + ttlSeconds;
  }

  private async put(sk: string, item: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    await this.client.send(
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
  }

  private async get<T = Record<string, unknown>>(sk: string): Promise<T | undefined> {
    try {
      const out = await this.client.send(
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
      logger.debug(
        { error: err?.name ?? "unknown", message: err?.message ?? String(err) },
        "DynamoStore.get failed: @{error} - @{message}",
      );
      return undefined;
    }
  }

  private async del(sk: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
        }),
      );
    } catch (err: any) {
      logger.debug(
        { error: err?.name ?? "unknown", message: err?.message ?? String(err) },
        "DynamoStore.del failed: @{error} - @{message}",
      );
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
    assertSize("user info key", key, MAX_KEY_BYTES);
    assertSize("user info payload", JSON.stringify(data ?? {}), MAX_VALUE_BYTES);
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
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: this.pk, sk },
          ConditionExpression: "#t = :current",
          ExpressionAttributeNames: { "#t": "token" },
          ExpressionAttributeValues: { ":current": current },
        }),
      );
    } catch {
      return undefined;
    }
    return current;
  }

  async deleteWebAuthnToken(key: string): Promise<void> {
    await this.del(this.getWebAuthnTokenKey(key));
  }

  close(): void {
    this.client.destroy();
  }
}
