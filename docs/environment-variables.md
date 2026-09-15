# Environment variables

> Security note: keep sensitive values such as `client-secret` and passwords in environment variables instead of plain text in the Verdaccio config file.

## How it works

Every option under `auth.openid` can be set through an environment variable. The plugin resolves values in this order:

1. Config file value: if the value is a valid environment variable name matching `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, the plugin reads that environment variable.
2. Default environment variable: if the config value is empty or is not a valid environment variable name, the plugin checks `VERDACCIO_OPENID_<KEY>` in uppercase snake_case.
3. Literal config value: if neither of the above applies, the value from the config file is used as-is.

Environment variables take precedence over config-file values.

## Default variable names

The default naming pattern is `VERDACCIO_OPENID_` followed by the config key in uppercase, with hyphens replaced by underscores:

| Config key          | Environment variable                 |
| ------------------- | ------------------------------------ |
| `client-id`         | `VERDACCIO_OPENID_CLIENT_ID`         |
| `client-secret`     | `VERDACCIO_OPENID_CLIENT_SECRET`     |
| `provider-host`     | `VERDACCIO_OPENID_PROVIDER_HOST`     |
| `authorized-groups` | `VERDACCIO_OPENID_AUTHORIZED_GROUPS` |
| `group-users`       | `VERDACCIO_OPENID_GROUP_USERS`       |
| `store-type`        | `VERDACCIO_OPENID_STORE_TYPE`        |
| `[key]`             | `VERDACCIO_OPENID_[KEY]`             |

## Custom variable names

You can also point a config key at any environment variable name:

```yaml
auth:
  openid:
    client-id: MY_CLIENT_ID # reads from $MY_CLIENT_ID
    client-secret: MY_CLIENT_SECRET # reads from $MY_CLIENT_SECRET
```

## Store config environment variables

The `store-config` keys use the pattern `VERDACCIO_OPENID_STORE_CONFIG_<KEY>`.

| Store config key | Environment variable                       |
| ---------------- | ------------------------------------------ |
| `username`       | `VERDACCIO_OPENID_STORE_CONFIG_USERNAME`   |
| `password`       | `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD`   |
| `tableName`      | `VERDACCIO_OPENID_STORE_CONFIG_TABLENAME`  |
| `region`         | `VERDACCIO_OPENID_STORE_CONFIG_REGION`     |
| `uri`            | `VERDACCIO_OPENID_STORE_CONFIG_URI`        |
| `database`       | `VERDACCIO_OPENID_STORE_CONFIG_DATABASE`   |
| `collection`     | `VERDACCIO_OPENID_STORE_CONFIG_COLLECTION` |

## JSON values

Environment variable values can also be JSON strings. If they parse as an object, that parsed value is used. This is useful for nested settings like `group-users`:

```bash
export VERDACCIO_OPENID_GROUP_USERS='{"group1": ["user1", "user2"], "group2": ["user3"]}'
```

Boolean strings such as `"true"` and `"false"` are parsed to their boolean equivalents.

## Dotenv files

The plugin loads `.env` files automatically in this order:

1. `$HOME/.env`
2. `$HOME/.env.openid`
3. `$PWD/.env`
4. `$PWD/.env.openid`

Later files do not override earlier ones; the first match wins.

This is handy for setting defaults across machines while still allowing project-specific overrides.
