# verdaccio-openid

[![npm](https://img.shields.io/npm/v/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dw/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dt/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/l/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)

English | [中文](README.zh-CN.md)

## About

A Verdaccio plugin that provides OIDC OAuth integration for both the browser and the command line.

## Compatibility

- Verdaccio 5, 6, 7
- Node >= 20
- Browsers supporting [ES6](https://caniuse.com/?search=es6)

## Install

### Global Install

```sh
npm install -g verdaccio-openid
```

### Install to Verdaccio Plugins Folder (Advanced)

```bash
mkdir -p ./install-here/
npm install --global-style \
  --bin-links=false --save=false --package-lock=false \
  --omit=dev --omit=optional --omit=peer \
  --prefix ./install-here/ \
  verdaccio-openid@latest
mv ./install-here/node_modules/verdaccio-openid/ /path/to/verdaccio/plugins/
```

## Configuration

Add the following to your Verdaccio config:

```yaml
middlewares:
  openid:
    enabled: true

auth:
  openid:
    provider-host: https://example.com
    client-id: CLIENT_ID
    client-secret: CLIENT_SECRET
    username-claim: name
    # scope: openid email groups
    # groups-claim: groups
    # provider-type: gitlab
    # store-type: file
    # store-config: ./store
    # authorized-groups:
    #   - access
    # group-users:
    #   animal:
    #     - tom
    #     - jack
```

### Required Options

| Config key      | Description                               |
| --------------- | ----------------------------------------- |
| `provider-host` | The host of the OIDC provider.            |
| `client-id`     | The client ID from the OIDC provider.     |
| `client-secret` | The client secret from the OIDC provider. |

See [Configuration](docs/configuration.md) for all available options.

## OpenID Callback URLs

Configure these in your OIDC provider:

| Flow      | Callback URL                                       |
| --------- | -------------------------------------------------- |
| Web Authn | `https://your-registry.com/-/oauth/callback/authn` |
| Web UI    | `https://your-registry.com/-/oauth/callback`       |
| CLI       | `https://your-registry.com/-/oauth/callback/cli`   |

## Authentication

### Web UI

Once configured, clicking the login button redirects directly to the OIDC provider.

If `auth.htpasswd.file` is configured, the login dialog appears first with username/password fields, and the OIDC login button is shown below them — allowing users to choose either method.

![Login Dialog](docs/images/login-dialog.png)

Set `keep-passwd-login` explicitly to override the auto-detection. See [keep-passwd-login](docs/configuration.md#keep-passwd-login) for details.

### Web Authn (Recommended)

```sh
npm login --registry http://your-registry.com
```

Opens a browser window for OIDC login and saves the token automatically.

> **Note:** npm v9+ defaults to `--auth-type=web`. For npm v8.14–v8.x, add `--auth-type=web` explicitly. For npm < v8.14, use the legacy flow:
>
> ```sh
> npm login --auth-type=legacy --registry http://your-registry.com
> ```
>
> See the [npm docs](https://docs.npmjs.com/accessing-npm-using-2fa#sign-in-from-the-command-line-using---auth-typeweb) for more details.

### CLI (Alternative)

```sh
npx verdaccio-openid@latest --registry http://your-registry.com
```

Uses a local callback server to receive the token. Falls back to this if Web Authn is unavailable (e.g. older npm versions). See [CLI Authentication](docs/cli-auth.md) for legacy login options.

## Store Backends

Choose a store backend for session state and caches:

| Type                  | Best for                    |
| --------------------- | --------------------------- |
| `in-memory` (default) | Single-process, development |
| `redis`               | Multi-replica deployments   |
| `file`                | Single-node, persistent     |
| `dynamodb`            | Cloud-native, multi-replica |

See [Store Configuration](docs/store-config.md) for setup instructions and required peer dependencies.

## Environment Variables

All config values can be set via environment variables — useful for keeping sensitive data out of your config file. See [Environment Variables](docs/environment-variables.md) for the naming convention and dotenv support.

## Contributing

See [Development](docs/development.md) for build instructions, testing, and project structure.

## Documentation

- [Configuration](docs/configuration.md) — all config options, provider discovery
- [Store Configuration](docs/store-config.md) — Redis, File, DynamoDB backends and peer dependencies
- [Environment Variables](docs/environment-variables.md) — env var mapping, dotenv support
- [CLI Authentication](docs/cli-auth.md) — CLI login flow
- [Development](docs/development.md) — build, test, project structure

## License

MIT
