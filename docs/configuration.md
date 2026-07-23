# Configuration

## OpenID Connect Options

These options go under `auth.openid` in your Verdaccio config (`config.yaml`):

| Config key               | Type                                                   | Default                     | Required | Description                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------ | --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider-host`          | `string`                                               |                             | Yes      | The host of the OIDC provider.                                                                                                                                                                                                                      |
| `configuration-uri`      | `string`                                               |                             | No       | The URI of the OIDC provider configuration.                                                                                                                                                                                                         |
| `issuer`                 | `string`                                               |                             | No       | The issuer of the OIDC provider. Used when manually configuring individual endpoints; defaults to `provider-host` if not set.                                                                                                                       |
| `authorization-endpoint` | `string`                                               |                             | No       | The authorization endpoint.                                                                                                                                                                                                                         |
| `token-endpoint`         | `string`                                               |                             | No       | The token endpoint.                                                                                                                                                                                                                                 |
| `userinfo-endpoint`      | `string`                                               |                             | No       | The userinfo endpoint.                                                                                                                                                                                                                              |
| `jwks-uri`               | `string`                                               |                             | No       | The JWKS URI.                                                                                                                                                                                                                                       |
| `scope`                  | `string`                                               | `openid`                    | No       | The OIDC scope.                                                                                                                                                                                                                                     |
| `client-id`              | `string`                                               |                             | Yes      | The client ID from the OIDC provider.                                                                                                                                                                                                               |
| `client-secret`          | `string`                                               |                             | Yes      | The client secret from the OIDC provider.                                                                                                                                                                                                           |
| `username-claim`         | `string`                                               | `sub`                       | No       | The claim used to get the username from the ID token or userinfo endpoint.                                                                                                                                                                          |
| `groups-claim`           | `string`                                               |                             | No       | The claim used to get the groups from the ID token or userinfo endpoint.                                                                                                                                                                            |
| `provider-type`          | `string`                                               |                             | No       | The provider type for fetching groups. Supported: `gitlab`.                                                                                                                                                                                         |
| `store-type`             | `"in-memory"` \| `"redis"` \| `"file"` \| `"dynamodb"` | `in-memory`                 | No       | The store backend for OIDC state and caches. See [Store Configuration](store-config.md).                                                                                                                                                            |
| `store-config`           | `string` \| `object`                                   | `{ ttl: 60000 }`            | No       | Store-specific configuration. See [Store Configuration](store-config.md).                                                                                                                                                                           |
| `keep-passwd-login`      | `boolean`                                              | auto-detect                 | No       | Keep the htpasswd login dialog. See [keep-passwd-login](#keep-passwd-login).                                                                                                                                                                        |
| `login-button-text`      | `string`                                               | `Login with OpenID Connect` | No       | The text of the OpenID login button.                                                                                                                                                                                                                |
| `authorized-groups`      | `string` \| `string[]` \| `boolean`                    | `false`                     | No       | Groups allowed to log in. `true` requires at least one group; `false` disables group check.                                                                                                                                                         |
| `group-users`            | `object`                                               |                             | No       | Custom group-to-user mapping. When set, groups from `group-users` override any groups obtained from `groups-claim` or `provider-type`. Leave `provider-type` and `groups-claim` unset when using only `group-users` to avoid unnecessary API calls. |

### Provider Discovery

The plugin discovers the OIDC provider configuration in one of three ways:

1. **Via `configuration-uri`** — directly fetch the provider metadata from the given URI. When set, issuer verification is skipped. See [OpenID Client Discovery](https://github.com/panva/openid-client/blob/main/docs/functions/discovery.md).
2. **Via individual endpoints** — set `authorization-endpoint`, `token-endpoint`, `userinfo-endpoint`, and `jwks-uri` manually. When any of these are set, auto-discovery is skipped.
3. **Via `provider-host`** — auto-discover from the provider's `.well-known/openid-configuration` endpoint.

### `provider-type: gitlab`

When set to `gitlab`, the plugin uses the [GitLab Groups API](https://docs.gitlab.com/ee/api/groups.html) to fetch the user's groups instead of reading them from the ID token or userinfo claims. The user's access token is used to authenticate against the GitLab API.

Requirements:

- `provider-host` must point to the GitLab instance (e.g. `https://gitlab.com`).
- The `groups-claim` config is ignored — groups always come from the API.

## `keep-passwd-login`

By default, the plugin checks whether `auth.htpasswd.file` is set in your Verdaccio config. If it is, the htpasswd login dialog is kept alongside the OIDC login button.

Explicitly set `keep-passwd-login` to override this behavior:

```yaml
auth:
  openid:
    keep-passwd-login: true # Force keep
    # keep-passwd-login: false  # Force hide
```

With both authentication methods enabled, users can choose between htpasswd and OIDC login on the login page.

![Login Dialog](images/login-dialog.png)

## Token Expiration

Token expiration is controlled by Verdaccio's security settings, not by this plugin:

```yaml
security:
  api:
    jwt:
      sign:
        expiresIn: 7d # npm CLI token expiration
  web:
    sign:
      expiresIn: 7d # web UI token expiration
```

See the [Verdaccio docs](https://verdaccio.org/docs/configuration#security) for details.
