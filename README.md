# verdaccio-openid

[![npm](https://img.shields.io/npm/v/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dw/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dt/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/l/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)

## About

This is a Verdaccio plugin that offers OIDC OAuth integration for both the browser and the command line.

## Compatibility

- Verdaccio 5, 6
- Node >=18
- Browsers which support [ES5](https://caniuse.com/?search=es5)

## Setup

### Install

1. Install globally

```sh
npm install -g verdaccio-openid
```

2. Install to Verdaccio plugins folder

> npm >= 7

```bash
mkdir -p ./install-here/
npm install --global-style \
  --bin-links=false --save=false --package-lock=false \
  --omit=dev --omit=optional --omit=peer \
  --prefix ./install-here/ \
  verdaccio-openid@latest
mv ./install-here/node_modules/verdaccio-openid/ /path/to/verdaccio/plugins/
```

### Verdaccio Config

Merge the below options with your existing Verdaccio config:

```yml
middlewares:
  openid:
    enabled: true

auth:
  openid:
    provider-host: https://example.com
    # configuration-uri: https://example.com/.well-known/openid-configuration
    # issuer: https://example.com
    # authorization-endpoint: https://example.com/oauth/authorize
    # token-endpoint: https://example.com/oauth/token
    # userinfo-endpoint: https://example.com/oauth/userinfo
    # jwks-uri: https://example.com/oauth/jwks
    # scope: openid email groups
    client-id: CLIENT_ID
    client-secret: CLIENT_SECRET
    username-claim: name
    # groups-claim: groups
    # provider-type: gitlab
    # store-type: file
    # store-config: ./store
    # authorized-groups:
    #  - access
    # group-users:
    #   animal:
    #     - tom
    #     - jack
```

Now you can use the openid-connect auth in the webUI.

### Config Options

#### openid

| Config key                                                                                                                                                                       | Value Type                       | Default                     | Required | Example                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------- | -------- | ------------------------------------------------------ |
| <details><summary>provider-host</summary>The host of the OIDC provider</details>                                                                                                 | string                           |                             | Yes      | `https://example.com`                                  |
| <details><summary>configuration-uri</summary>The URI of the OIDC provider configuration</details>                                                                                | string                           |                             | No       | `https://example.com/.well-known/openid-configuration` |
| <details><summary>issuer</summary>The issuer of the OIDC provider</details>                                                                                                      | string                           |                             | No       | `https://example.com`                                  |
| <details><summary>authorization-endpoint</summary>The authorization endpoint of the OIDC provider</details>                                                                      | string                           |                             | No       | `https://example.com/oauth/authorize`                  |
| <details><summary>token-endpoint</summary>The token endpoint of the OIDC provider</details>                                                                                      | string                           |                             | No       | `https://example.com/oauth/token`                      |
| <details><summary>userinfo-endpoint</summary>The userinfo endpoint of the OIDC provider</details>                                                                                | string                           |                             | No       | `https://example.com/oauth/userinfo`                   |
| <details><summary>jwks-uri</summary>The JWKS URI of the OIDC provider</details>                                                                                                  | string                           |                             | No       | `https://example.com/oauth/jwks`                       |
| <details><summary>scope</summary>The scope of the OIDC provider</details>                                                                                                        | string                           | `openid`                    | No       | `openid email groups`                                  |
| <details><summary>client-id</summary>The client ID of the OIDC provider</details>                                                                                                | string                           |                             | Yes      | `your-client-id`                                       |
| <details><summary>client-secret</summary>The client secret of the OIDC provider</details>                                                                                        | string                           |                             | Yes      | `your-client-secret`                                   |
| <details><summary>username-claim</summary>The claim to get the username from the ID token or userinfo endpoint response</details>                                                | string                           | `sub`                       | No       | `name`                                                 |
| <details><summary>groups-claim</summary>The claim to get the groups from the ID token or userinfo endpoint response</details>                                                    | string                           |                             | No       | `groups`                                               |
| <details><summary>provider-type</summary>The provider type to get groups from the provider. Supported values: `gitlab`</details>                                                 | string                           |                             | No       | `gitlab`                                               |
| <details><summary>store-type</summary>The store type to store the OIDC state and caches.</details>                                                                               | "in-memory" \| "redis" \| "file" | `in-memory`                 | No       | `file`                                                 |
| <details><summary>store-config</summary>The store configuration.</details>                                                                                                       | string \| object                 | `{ ttl: 60000 }`            | No       | `./store`                                              |
| <details><summary>keep-passwd-login</summary>Keep the htpasswd login dialog. If set to `true`, the htpasswd login dialog will be kept.</details>                                 | boolean                          | `undefined`                 | No       | `true`                                                 |
| <details><summary>login-button-text</summary>The text of the OpenID connect login button</details>                                                                               | string                           | `Login with OpenID Connect` | No       | `Login with GitLab`                                    |
| <details><summary>authorized-groups</summary>The groups that are allowed to login. Use `true` to ensure the user has at least one group, `false` means no groups check</details> | string \| string \| boolean      | `false`                     | No       | `true`                                                 |
| <details><summary>group-users</summary>The custom group users. If set, `groups-claim` and `provider-type` take no effect</details>                                               | object                           |                             | No       | `{"animal": ["Tom", "Jack"]}`                          |

#### store-config

1. in-memory

When using the `in-memory` store, the `store-config` is an object with the following properties:

| Config key | Description                                                                                                   | Value Type       | Default | Required | Example |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ------- | -------- | ------- |
| ttl        | The TTL of the OIDC state (ms).                                                                               | number \| string | `60000` | No       | `1m`    |
| ...        | All options are passed to the [@isaacs/ttlcache](https://www.npmjs.com/package/@isaacs/ttlcache) constructor. | any              |         | No       |         |

2. redis

When using the `redis` store, the `store-config` is a string with the Redis connection string or an object with the following properties:

| Config key | Description                                                                                 | Value Type                     | Default | Required | Example                               |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------ | ------- | -------- | ------------------------------------- |
| ttl        | The TTL of the OIDC state (ms).                                                             | number \| string               | `60000` | No       | `1m`                                  |
| username   | The username of the Redis connection.                                                       | string                         |         | No       | `your-username`                       |
| password   | The password of the Redis connection.                                                       | string                         |         | No       | `your-password`                       |
| host       | The host of the Redis connection.                                                           | string                         |         | No       | `localhost`                           |
| port       | The port of the Redis connection.                                                           | number                         |         | No       | `6379`                                |
| nodes      | The nodes of the Redis Cluster connection.                                                  | (object \| string \| number)[] |         | No       | `[{ host: 'localhost', port: 6379 }]` |
| ...        | All options are passed to the [ioredis](https://www.npmjs.com/package/ioredis) constructor. | any                            |         | No       |                                       |

The `username` and `password` can be set with the `VERDACCIO_OPENID_STORE_CONFIG_USERNAME` and `VERDACCIO_OPENID_STORE_CONFIG_PASSWORD` environment variables. Or you can use your own environment variable names.

Config example:

```yaml
auth:
  openid:
    store-type: redis
    store-config: redis://your-username:your-password@localhost:6379
```

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

When using Redis Cluster, you should use the `nodes` property:

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
        # ... other ioredis options
```

3. file

When using the `file` store, the `store-config` is a string with the file path to store the OIDC state or an object with the following properties:

| Config key | Description                                                                                           | Value Type       | Default | Required | Example   |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------------- | ------- | -------- | --------- |
| ttl        | The TTL of the OIDC state (ms).                                                                       | number \| string | `60000` | No       | `1m`      |
| dir        | The directory to store the OIDC state.                                                                | string           |         | No       | `./store` |
| ...        | All options are passed to the [node-persist](https://www.npmjs.com/package/node-persist) constructor. | any              |         | No       |           |

Config example:

```yaml
auth:
  openid:
    store-type: file
    store-config: ./store
```

```yaml
auth:
  openid:
    store-type: file
    store-config:
      ttl: 60000
      dir: ./store
```

#### keep-passwd-login

If you want to keep the htpasswd login dialog, set the `keep-passwd-login` to `true`.

By default, if `auth.htpasswd.file` is set, the htpasswd login dialog will be keep.

With this, you can use both the htpasswd login and the OIDC login.

![Login Dialog](./images/login-dialog.png)

### Environment Variables

You can set each config with environment variables to avoid storing sensitive information in the config file.
Every config can be set with an environment variable name, matching the regex `/^[a-zA-Z_][a-zA-Z0-9_]*$/`.

```yaml
auth:
  openid:
    client-id: MY_CLIENT_ID
    client-secret: MY_CLIENT_SECRET
```

If the config value is not set, the plugin will try to read the value from the environment variable.
The default environment variable name is `VERDACCIO_OPENID_` followed by the config key in uppercase and snake case.

| Config Key        | Environment Name                     | Value Example                                                  |
| ----------------- | ------------------------------------ | -------------------------------------------------------------- |
| client-id         | `VERDACCIO_OPENID_CLIENT_ID`         | `your-client-id`                                               |
| client-secret     | `VERDACCIO_OPENID_CLIENT_SECRET`     | `your-client-secret`                                           |
| provider-host     | `VERDACCIO_OPENID_PROVIDER_HOST`     | `https://example.com`                                          |
| authorized-groups | `VERDACCIO_OPENID_AUTHORIZED_GROUPS` | `true`                                                         |
| group-users       | `VERDACCIO_OPENID_GROUP_USERS`       | `{"group1": ["user1", "user2"], "group2": ["user3", "user4"]}` |
| [key]             | `VERDACCIO_OPENID_[KEY]`             | other config value is the same as above                        |

The environment value can be a string or a JSON string. If it is a JSON string, the plugin will parse it to a JSON object.

Note: The environment variable will take precedence over the config value. That means if the config value is like an environment variable name(matching above regex), and the environment variable is set, the plugin will use the environment variable value.

### Dotenv files

You can use a `.env` file to set the environment variables. The plugin will read the `.env` file in the HOME directory and the directory where the Verdaccio process is started.

The load order is:

1. $HOME/.env
2. $HOME/.env.openid
3. $PWD/.env
4. $PWD/.env.openid

### Token Expiration

To set the token expiration time, follow the instructions in the [Verdaccio docs](https://verdaccio.org/docs/configuration#security).

```yml
security:
  api:
    jwt:
      sign:
        expiresIn: 7d # npm token expiration
  web:
    sign:
      expiresIn: 7d # webUI token expiration
```

## OpenID Callback URL

- Web UI: https://your-registry.com/-/oauth/callback
- CLI: https://your-registry.com/-/oauth/callback/cli

## Auth with CLI

```sh
npx verdaccio-openid@latest --registry http://your-registry.com
```
