# Store configuration

The `store-type` and `store-config` settings control where OIDC state, user info, user groups, and WebAuthn tokens are saved.

| Store       | Persistence      | Typical use                                   |
| ----------- | ---------------- | --------------------------------------------- |
| `in-memory` | Process memory   | Single-process setups and local development   |
| `redis`     | Redis            | Multi-process or multi-replica deployments    |
| `file`      | Local filesystem | Single-node deployments                       |
| `dynamodb`  | AWS DynamoDB     | Cloud-native, multi-replica setups            |
| `mongodb`   | MongoDB          | Multi-replica setups that already use MongoDB |

## Peer dependencies

Each backend except `in-memory` needs an optional peer dependency. The plugin does not bundle them, so install them alongside the plugin:

| Store      | Required package                                     |
| ---------- | ---------------------------------------------------- |
| `redis`    | `ioredis`                                            |
| `file`     | `node-persist`                                       |
| `dynamodb` | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` |
| `mongodb`  | `mongodb`                                            |

If the required package is missing, the plugin throws a clear error the first time the store is used.

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

## Common options

All store backends support the `ttl` option, which accepts milliseconds or a time string like `1m`:

| Config key | Type                 | Default            | Description                             |
| ---------- | -------------------- | ------------------ | --------------------------------------- |
| `ttl`      | `number` \| `string` | `60000` (1 minute) | TTL for OIDC state and WebAuthn tokens. |

> User info and group caches always expire after five minutes, regardless of `ttl`.

---

## `in-memory`

This backend uses [@isaacs/ttlcache](https://www.npmjs.com/package/@isaacs/ttlcache). No extra setup is required.

```yaml
auth:
  openid:
    store-type: in-memory
    store-config:
      ttl: 1m
```

All options are passed to the `TTLCache` constructor. Supported options include `max`, `ttl`, and `noDisposeOnSet`.

---

## `redis`

This backend uses [ioredis](https://www.npmjs.com/package/ioredis) and supports both single-node and cluster setups.

**Install:** `npm install ioredis`

### Connection string

```yaml
auth:
  openid:
    store-type: redis
    store-config: redis://username:password@localhost:6379
```

### Object config

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

### Redis cluster

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
        # additional ioredis options
```

### Environment variables for credentials

The `username` and `password` fields can be set with environment variables:

- `VERDACCIO_OPENID_STORE_CONFIG_USERNAME`
- `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD`

You can also use your own environment variable names. See [Environment Variables](environment-variables.md).

### Options

| Config key | Type                             | Description                                              |
| ---------- | -------------------------------- | -------------------------------------------------------- |
| `ttl`      | `number` \| `string`             | State TTL. Default: `60000`.                             |
| `username` | `string`                         | Redis username.                                          |
| `password` | `string`                         | Redis password.                                          |
| `host`     | `string`                         | Redis host.                                              |
| `port`     | `number`                         | Redis port.                                              |
| `nodes`    | `(object \| string \| number)[]` | Cluster nodes.                                           |
| `...`      | any                              | Any other options are passed to the ioredis constructor. |

---

## `file`

This backend uses [node-persist](https://www.npmjs.com/package/node-persist) and stores state as files on disk.

**Install:** `npm install node-persist`

### String config (directory path)

```yaml
auth:
  openid:
    store-type: file
    store-config: ./store
```

The path is relative to the Verdaccio config file directory.

### Object config

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
| `ttl`      | `number` \| `string` | State TTL. Default: `60000`.                                          |
| `dir`      | `string`             | Storage directory.                                                    |
| `...`      | any                  | Any other options are passed to the `node-persist` `create()` method. |

---

## `dynamodb`

This backend uses the AWS SDK for DynamoDB. OIDC state, user info, groups, and WebAuthn tokens are stored in one DynamoDB table and shared across replicas.

**Install:** `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`

### Table setup

The table must already exist with these attributes:

- `pk` (S) — partition key
- `sk` (S) — sort key
- `expires` (N) — TTL attribute, configured in the AWS console

### IAM permissions

The IAM principal needs these actions on the table:

```
dynamodb:GetItem
dynamodb:PutItem
dynamodb:DeleteItem
```

Credentials are resolved through the standard AWS SDK provider chain, including environment variables, `~/.aws/credentials`, and IAM roles. No credentials are stored in the Verdaccio config.

### Object config

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

| Config key     | Type                 | Default | Required | Description                                                                                            |
| -------------- | -------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `ttl`          | `number` \| `string` | `60000` | No       | State TTL.                                                                                             |
| `tableName`    | `string`             |         | Yes      | DynamoDB table name.                                                                                   |
| `region`       | `string`             |         | Yes      | AWS region for the table.                                                                              |
| `partitionKey` | `string`             | `OIDC`  | No       | Partition key value used to namespace this plugin's rows. Set a unique value when the table is shared. |

---

## `mongodb`

This backend uses the official [mongodb](https://www.npmjs.com/package/mongodb) Node.js driver. OIDC state, user info, groups, and WebAuthn tokens are stored as documents in a single collection and shared across replicas. It works with any MongoDB 4.0+ compatible server, including MongoDB Atlas, Azure Cosmos DB for MongoDB (vCore), and Amazon DocumentDB.

**Install:** `npm install mongodb`

### Collection setup

Nothing special is required. The collection is created on first write, and the plugin creates a TTL index on `expiresAt` with `expireAfterSeconds: 0` so the database can garbage-collect expired documents. Expiration is also checked on reads, so a missing TTL index only affects cleanup; the plugin logs a warning and keeps working.

The connecting user needs `find`, `insert`, `update`, `remove`, and `createIndex` access on the collection. The built-in `readWrite` role covers those permissions.

### Connection string

```yaml
auth:
  openid:
    store-type: mongodb
    store-config: mongodb://user:password@localhost:27017/verdaccio
```

### Object config

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
