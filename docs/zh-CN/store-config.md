# 存储配置

`store-type` 和 `store-config` 选项控制 OIDC 状态、用户信息、用户组和 WebAuthn token 的持久化存储位置。

| 存储        | 持久化方式   | 适用场景             |
| ----------- | ------------ | -------------------- |
| `in-memory` | 进程内存     | 单进程部署、开发环境 |
| `redis`     | Redis        | 多进程/多副本部署    |
| `file`      | 本地文件系统 | 单节点部署           |
| `dynamodb`  | AWS DynamoDB | 多副本、云原生部署   |

## Peer Dependencies

每种存储后端（`in-memory` 除外）都需要一个可选的 peer dependency。插件不会捆绑这些包 — 需要与插件一起安装：

| 存储       | 所需包                                               |
| ---------- | ---------------------------------------------------- |
| `redis`    | `ioredis`                                            |
| `file`     | `node-persist`                                       |
| `dynamodb` | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` |

如果缺少所需的包，插件将在首次访问存储时抛出错误，并附上清晰的安装说明。

```bash
# Redis
npm install ioredis

# File
npm install node-persist

# DynamoDB
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## 通用选项

所有存储后端都支持 `ttl` 选项（毫秒数或时间字符串，如 `1m`）：

| 配置项 | 类型                 | 默认值            | 说明                                    |
| ------ | -------------------- | ----------------- | --------------------------------------- |
| `ttl`  | `number` \| `string` | `60000`（1 分钟） | OIDC 状态和 WebAuthn token 的过期时间。 |

> **注意**：用户信息和组缓存的过期时间固定为 5 分钟，不受 `ttl` 影响。

---

## `in-memory`

使用 [@isaacs/ttlcache](https://www.npmjs.com/package/@isaacs/ttlcache)。无需额外配置。

```yaml
auth:
  openid:
    store-type: in-memory
    store-config:
      ttl: 1m
```

所有选项将传递给 `TTLCache` 构造函数。支持的选项包括 `max`、`ttl`、`noDisposeOnSet` 等。

---

## `redis`

使用 [ioredis](https://www.npmjs.com/package/ioredis)。支持单节点和集群模式。

**安装：** `npm install ioredis`

### 连接字符串

```yaml
auth:
  openid:
    store-type: redis
    store-config: redis://username:password@localhost:6379
```

### 对象配置

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

### Redis 集群

使用 `nodes` 属性配置集群模式：

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
        # ... 其他 ioredis 选项
```

### 凭据环境变量

`username` 和 `password` 字段可通过环境变量设置：

- `VERDACCIO_OPENID_STORE_CONFIG_USERNAME`
- `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD`

或使用自定义环境变量名。详见 [环境变量](environment-variables.md)。

### 选项

| 配置项     | 类型                             | 说明                                    |
| ---------- | -------------------------------- | --------------------------------------- |
| `ttl`      | `number` \| `string`             | 状态过期时间（默认：`60000`）。         |
| `username` | `string`                         | Redis 用户名。                          |
| `password` | `string`                         | Redis 密码。                            |
| `host`     | `string`                         | Redis 主机。                            |
| `port`     | `number`                         | Redis 端口。                            |
| `nodes`    | `(object \| string \| number)[]` | 集群节点。                              |
| `...`      | any                              | 所有其他选项将传递给 ioredis 构造函数。 |

---

## `file`

使用 [node-persist](https://www.npmjs.com/package/node-persist)。将状态存储为磁盘文件。

**安装：** `npm install node-persist`

### 字符串配置（目录路径）

```yaml
auth:
  openid:
    store-type: file
    store-config: ./store
```

路径相对于 Verdaccio 配置文件目录。

### 对象配置

```yaml
auth:
  openid:
    store-type: file
    store-config:
      ttl: 60000
      dir: ./store
```

### 选项

| 配置项 | 类型                 | 说明                                                     |
| ------ | -------------------- | -------------------------------------------------------- |
| `ttl`  | `number` \| `string` | 状态过期时间（默认：`60000`）。                          |
| `dir`  | `string`             | 存储目录。                                               |
| `...`  | any                  | 所有其他选项将传递给 `node-persist` 的 `create()` 方法。 |

---

## `dynamodb`

使用 AWS SDK for DynamoDB。OIDC 状态、用户信息、组和 WebAuthn token 持久化存储在 DynamoDB 表中 — 所有副本共享。

**安装：** `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`

### 表设置

DynamoDB 表必须已存在，且包含以下字段：

- `pk`（S）— 分区键
- `sk`（S）— 排序键
- `expires`（N）— TTL 属性（必须在 AWS 控制台中配置为 TTL 属性）

### IAM 权限

IAM 主体需要对该表拥有以下操作权限：

```
dynamodb:GetItem
dynamodb:PutItem
dynamodb:DeleteItem
```

凭据通过标准 AWS SDK 提供方链解析（环境变量、`~/.aws/credentials`、IAM 角色等）。**不会在 Verdaccio 配置中存储任何凭据。**

### 对象配置

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

### 选项

| 配置项         | 类型                 | 默认值  | 必填 | 说明                                             |
| -------------- | -------------------- | ------- | ---- | ------------------------------------------------ |
| `ttl`          | `number` \| `string` | `60000` | 否   | 状态过期时间。                                   |
| `tableName`    | `string`             |         | 是   | DynamoDB 表名。                                  |
| `region`       | `string`             |         | 是   | 表的 AWS 区域。                                  |
| `partitionKey` | `string`             | `OIDC`  | 否   | 用于命名空间隔离的分区键值。共享表时设置唯一值。 |
