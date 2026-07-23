# 环境变量

> **安全提醒**：将敏感信息（client-secret、密码等）通过环境变量注入，而不是明文写在 Verdaccio 配置文件中。

## 工作原理

`auth.openid` 下的每个配置项都可以通过环境变量设置。插件按以下顺序解析值：

1. **配置文件值** — 如果该值是有效的环境变量名（匹配 `/^[a-zA-Z_][a-zA-Z0-9_]*$/`），插件会查找对应的环境变量。
2. **默认环境变量** — 如果配置值未设置，或设置的值不是有效的环境变量名（不匹配 `/^[a-zA-Z_][a-zA-Z0-9_]*$/`），插件会检查名为 `VERDACCIO_OPENID_<KEY>` 的环境变量（大写、蛇形命名）。
3. **配置文件值** — 使用配置文件中的字面值。

环境变量优先于配置文件值。

## 默认环境变量名

默认命名规则为 `VERDACCIO_OPENID_` 后跟配置项的大写、蛇形命名（连字符替换为下划线）：

| 配置项              | 环境变量                             |
| ------------------- | ------------------------------------ |
| `client-id`         | `VERDACCIO_OPENID_CLIENT_ID`         |
| `client-secret`     | `VERDACCIO_OPENID_CLIENT_SECRET`     |
| `provider-host`     | `VERDACCIO_OPENID_PROVIDER_HOST`     |
| `authorized-groups` | `VERDACCIO_OPENID_AUTHORIZED_GROUPS` |
| `group-users`       | `VERDACCIO_OPENID_GROUP_USERS`       |
| `store-type`        | `VERDACCIO_OPENID_STORE_TYPE`        |
| `[key]`             | `VERDACCIO_OPENID_[KEY]`             |

## 自定义环境变量名

除了使用默认名称，还可以将配置值设置为任意环境变量名来指向该变量：

```yaml
auth:
  openid:
    client-id: MY_CLIENT_ID # 从 $MY_CLIENT_ID 读取
    client-secret: MY_CLIENT_SECRET # 从 $MY_CLIENT_SECRET 读取
```

## Store 配置环境变量

`store-config` 的子键有独立的环境变量命名规则：`VERDACCIO_OPENID_STORE_CONFIG_<KEY>`。

| Store 配置项 | 环境变量                                  |
| ------------ | ----------------------------------------- |
| `username`   | `VERDACCIO_OPENID_STORE_CONFIG_USERNAME`  |
| `password`   | `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD`  |
| `tableName`  | `VERDACCIO_OPENID_STORE_CONFIG_TABLENAME` |
| `region`     | `VERDACCIO_OPENID_STORE_CONFIG_REGION`    |

## JSON 值

环境变量值可以是 JSON 字符串。如果值是有效的 JSON 且解析为对象，将使用解析后的值。这对于 `group-users` 等复杂类型非常有用：

```bash
export VERDACCIO_OPENID_GROUP_USERS='{"group1": ["user1", "user2"], "group2": ["user3"]}'
```

布尔值字符串（`"true"` / `"false"`）也会被解析为对应的布尔值。

## Dotenv 文件

插件会自动加载 `.env` 文件。加载顺序为：

1. `$HOME/.env`
2. `$HOME/.env.openid`
3. `$PWD/.env`
4. `$PWD/.env.openid`

后加载的文件不会覆盖先加载文件中的值 — 先匹配到的值优先。

这对于在机器上设置所有 Verdaccio 实例的默认值，并按项目覆盖非常有用。
