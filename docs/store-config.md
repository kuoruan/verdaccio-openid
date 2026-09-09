# Store Configuration

The `store-type` and `store-config` options control where OIDC state, user info, user groups, and WebAuthn tokens are persisted.

| Store       | Persistence      | Use case                                  |
| ----------- | ---------------- | ----------------------------------------- |
| `in-memory` | Process memory   | Single-process deployments, development   |
| `redis`     | Redis            | Multi-process / multi-replica deployments |
| `file`      | Local filesystem | Single-node deployments                   |
| `dynamodb`  | AWS DynamoDB     | Multi-replica, cloud-native deployments   |
| `mongodb`   | MongoDB          | Multi-replica, reuse an existing MongoDB  |

## Peer Dependencies

Each store backend (except `in-memory`) requires an optional peer dependency. The plugin does not bundle these — install them alongside the plugin:

| Store      | Required package                                     |
| ---------- | ---------------------------------------------------- |
| `redis`    | `ioredis`                                            |
| `file`     | `node-persist`                                       |
| `dynamodb` | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` |
| `mongodb`  | `mongodb`                                            |

If the required package is missing, the plugin will throw an error with a clear install instruction when the store is first accessed.

```bash
# Redis
npm install ioredis

# File
npm install node-persist

# DynamoDB
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# MongoDB
npm install mongodb
```

## Common Options

All store backends support the `ttl` option (milliseconds or time string like `1m`):

| Config key | Type                 | Default         | Description                             |
| ---------- | -------------------- | --------------- | --------------------------------------- |
| `ttl`      | `number` \| `string` | `60000` (1 min) | TTL for OIDC state and WebAuthn tokens. |

> **Note**: User info and group caches have a fixed 5-minute TTL, independent of `ttl`.

---

## `in-memory`

Uses [@isaacs/ttlcache](https://www.npmjs.com/package/@isaacs/ttlcache). No additional setup required.

```yaml
auth:
  openid:
    store-type: in-memory
    store-config:
      ttl: 1m
```

All options are passed to the `TTLCache` constructor. Supported options include `max`, `ttl`, `noDisposeOnSet`, etc.

---

## `redis`

Uses [ioredis](https://www.npmjs.com/package/ioredis). Supports single-node and cluster configurations.

**Install:** `npm install ioredis`

### Connection String

```yaml
auth:
  openid:
    store-type: redis
    store-config: redis://username:password@localhost:6379
```

### Object Config

```yaml
auth:
  openid:
    store-type: redis
    store-config:
      ttl: 60000
      username: your-username
      password: your-password
      host: localhost
      port: 6379
```

### Redis Cluster

Use the `nodes` property for cluster mode:

```yaml
auth:
  openid:
    store-type: redis
    store-config:
      ttl: 1m
      username: your-username
      password: your-password
      nodes:
        - host: localhost
          port: 6379
        - host: localhost
          port: 6380
      redisOptions:
        # ... additional ioredis options
```

### Environment Variables for Credentials

The `username` and `password` fields can be set via environment variables:

- `VERDACCIO_OPENID_STORE_CONFIG_USERNAME`
- `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD`

Or use your own environment variable names. See [Environment Variables](environment-variables.md).

### Options

| Config key | Type                             | Description                                              |
| ---------- | -------------------------------- | -------------------------------------------------------- |
| `ttl`      | `number` \| `string`             | State TTL (default: `60000`).                            |
| `username` | `string`                         | Redis username.                                          |
| `password` | `string`                         | Redis password.                                          |
| `host`     | `string`                         | Redis host.                                              |
| `port`     | `number`                         | Redis port.                                              |
| `nodes`    | `(object \| string \| number)[]` | Cluster nodes.                                           |
| `...`      | any                              | All other options are passed to the ioredis constructor. |

---

## `file`

Uses [node-persist](https://www.npmjs.com/package/node-persist). Stores state as files on disk.

**Install:** `npm install node-persist`

### String Config (directory path)

```yaml
auth:
  openid:
    store-type: file
    store-config: ./store
```

The path is relative to the Verdaccio config file directory.

### Object Config

```yaml
auth:
  openid:
    store-type: file
    store-config:
      ttl: 60000
      dir: ./store
```

### Options

| Config key | Type                 | Description                                                           |
| ---------- | -------------------- | --------------------------------------------------------------------- |
| `ttl`      | `number` \| `string` | State TTL (default: `60000`).                                         |
| `dir`      | `string`             | Storage directory.                                                    |
| `...`      | any                  | All other options are passed to the `node-persist` `create()` method. |

---

## `dynamodb`

Uses the AWS SDK for DynamoDB. OIDC state, user info, groups, and WebAuthn tokens are persisted in a DynamoDB table — shared across all replicas.

**Install:** `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`

### Table Setup

The DynamoDB table must already exist with:

- `pk` (S) — partition key
- `sk` (S) — sort key
- `expires` (N) — TTL attribute (must be configured as the TTL attribute in the AWS console)

### IAM Permissions

The IAM principal needs these actions on the table:

```
dynamodb:GetItem
dynamodb:PutItem
dynamodb:DeleteItem
```

Credentials are resolved through the standard AWS SDK provider chain (environment variables, `~/.aws/credentials`, IAM roles, etc.). **No credentials are stored in the Verdaccio config.**

### Object Config

```yaml
auth:
  openid:
    store-type: dynamodb
    store-config:
      tableName: verdaccio-openid
      region: us-east-1
```

```yaml
auth:
  openid:
    store-type: dynamodb
    store-config:
      ttl: 1m
      tableName: shared-app-state
      region: us-east-1
      partitionKey: OIDC-prod
```

### Options

| Config key     | Type                 | Default | Required | Description                                                                                     |
| -------------- | -------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `ttl`          | `number` \| `string` | `60000` | No       | State TTL.                                                                                      |
| `tableName`    | `string`             |         | Yes      | DynamoDB table name.                                                                            |
| `region`       | `string`             |         | Yes      | AWS region of the table.                                                                        |
| `partitionKey` | `string`             | `OIDC`  | No       | Partition key value to namespace this plugin's rows. Set a unique value when sharing the table. |

---

## `mongodb`

Uses the official [mongodb](https://www.npmjs.com/package/mongodb) Node.js driver. OIDC state, user info, groups, and WebAuthn tokens are persisted as documents in a single collection — shared across all replicas. Works with any MongoDB 4.0+ compatible server, including MongoDB Atlas, Azure Cosmos DB for MongoDB (vCore) and Amazon DocumentDB — handy when the registry already has a MongoDB next to it.

**Install:** `npm install mongodb`

### Collection Setup

Nothing to prepare. The collection is created on first write, and the plugin creates a TTL index on `expiresAt` (`expireAfterSeconds: 0`) so the server garbage-collects expired documents. Expiry is enforced on read as well, so a missing TTL index (for example with a role that cannot create indexes) only affects cleanup — the plugin logs a warning and keeps working.

The connecting user needs `find`, `insert`, `update`, `remove` and `createIndex` on the collection; the built-in `readWrite` role covers all of them.

### Connection String

```yaml
auth:
  openid:
    store-type: mongodb
    store-config: mongodb://user:password@localhost:27017/verdaccio
```

### Object Config

```yaml
auth:
  openid:
    store-type: mongodb
    store-config:
      uri: mongodb+srv://user:password@cluster.example.com/verdaccio?retryWrites=true
      database: verdaccio
      collection: openid-store
      ttl: 1m
```

### Credentials via Environment Variables

Keep the connection string out of the config file by naming an environment variable instead of the value:

```yaml
auth:
  openid:
    store-type: mongodb
    store-config:
      uri: MONGO_URI # Reads from $MONGO_URI
```

Or set no `store-config` at all and provide the connection string through the default variable `VERDACCIO_OPENID_STORE_CONFIG_URI`. See [Environment Variables](environment-variables.md).

### Options

| Config key   | Type                 | Default                                    | Required | Description                                                                                                                       |
| ------------ | -------------------- | ------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ttl`        | `number` \| `string` | `60000`                                    | No       | State TTL.                                                                                                                        |
| `uri`        | `string`             |                                            | Yes      | MongoDB connection string (`mongodb://` or `mongodb+srv://`). TLS, authentication mechanism and other driver options travel here. |
| `database`   | `string`             | database in `uri`, else `verdaccio-openid` | No       | Database name.                                                                                                                    |
| `collection` | `string`             | `openid-store`                             | No       | Collection name.                                                                                                                  |
