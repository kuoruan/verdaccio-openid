# Environment Variables

> **Security**: Store sensitive values (client-secret, passwords) in environment variables rather than plain text in your Verdaccio config file.

## How It Works

Every config key under `auth.openid` can be set via an environment variable. The plugin resolves values in this order:

1. **Config file value** — if the value is a valid environment variable name (matching `/^[a-zA-Z_][a-zA-Z0-9_]*$/`), the plugin looks up the environment variable.
2. **Default environment variable** — if the config value is not set, or the set value is not a valid environment variable name (matching `/^[a-zA-Z_][a-zA-Z0-9_]*$/`), the plugin checks the environment variable named `VERDACCIO_OPENID_<KEY>` (uppercase, snake_case).
3. **Config file value** — the literal value from the config file is used as-is.

Environment variables take precedence over config file values.

## Default Environment Variable Names

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

## Custom Environment Variable Names

Instead of using the default names, you can point a config key to any environment variable by setting the config value to that variable's name:

```yaml
auth:
  openid:
    client-id: MY_CLIENT_ID # Reads from $MY_CLIENT_ID
    client-secret: MY_CLIENT_SECRET # Reads from $MY_CLIENT_SECRET
```

## Store Config Environment Variables

The `store-config` sub-keys have their own environment variable pattern: `VERDACCIO_OPENID_STORE_CONFIG_<KEY>`.

| Store config key | Environment variable                      |
| ---------------- | ----------------------------------------- |
| `username`       | `VERDACCIO_OPENID_STORE_CONFIG_USERNAME`  |
| `password`       | `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD`  |
| `tableName`      | `VERDACCIO_OPENID_STORE_CONFIG_TABLENAME` |
| `region`         | `VERDACCIO_OPENID_STORE_CONFIG_REGION`    |

## JSON Values

Environment variable values can be JSON strings. If the value is valid JSON and parses to an object, it is used as the parsed value. This is useful for complex types like `group-users`:

```bash
export VERDACCIO_OPENID_GROUP_USERS='{"group1": ["user1", "user2"], "group2": ["user3"]}'
```

Boolean strings (`"true"` / `"false"`) are also parsed to their boolean equivalents.

## Dotenv Files

The plugin loads `.env` files automatically. The load order is:

1. `$HOME/.env`
2. `$HOME/.env.openid`
3. `$PWD/.env`
4. `$PWD/.env.openid`

Later files do not override values from earlier files — the first match wins.

This is useful for setting defaults across all Verdaccio instances on a machine, with per-project overrides.
