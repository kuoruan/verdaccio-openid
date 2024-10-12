# verdaccio-openid

[![npm](https://img.shields.io/npm/v/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dt/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/l/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)

## About

This is a Verdaccio plugin that offers OIDC OAuth integration for both the browser and the command line.

## Compatibility

- Verdaccio 5, 6
- Node >=18
- Chrome, Firefox, Firefox ESR, Edge, Safari

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
    provider-host: https://example.com # required, the host of oidc provider
    # configuration-uri: https://example.com/.well-known/openid-configuration # optional
    # issuer: https://example.com # optional, jwt issuer, use 'provider-host' when empty
    # authorization-endpoint: https://example.com/oauth/authorize # optional
    # token-endpoint: https://example.com/oauth/token # optional
    # userinfo-endpoint: https://example.com/oauth/userinfo # optional
    # jwks-uri: https://example.com/oauth/jwks # optional
    # scope: openid email groups # optional. custom scope, default is "openid"
    client-id: CLIENT_ID # optional, the client id
    client-secret: CLIENT_SECRET # optional, the client secret
    username-claim: name # optional. username claim in id_token, or key to get username in userinfo endpoint response, default is "sub"
    groups-claim: groups # optional. claim to get groups from
    # provider-type: gitlab # optional. define this to get groups from gitlab api
    # authorized-groups: # optional. user in array is allowed to login. use true to ensure user have at least one group, false means no groups check
    #  - access
    # group-users: # optional. custom the group users. eg. animal group has user tom and jack. if set, 'groups-claim' and 'provider-type' take no effect
    #   animal:
    #     - tom
    #     - jack
```

Now you can use the openid-connect auth in the webUI.

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

| Config Value      | Environment Name                     | Value Example                                                  |
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
