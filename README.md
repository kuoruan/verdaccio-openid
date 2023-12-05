# verdaccio-openid

[![npm](https://img.shields.io/npm/v/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dt/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/l/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)

## About

This is a Verdaccio plugin that offers OIDC OAuth integration for both the browser and the command line.

## Compatibility

- Verdaccio 5, 6
- Node 16, 18
- Chrome, Firefox, Firefox ESR, Edge, Safari

## Setup

### Install

1. Install globally

  ```sh
  npm install -S verdaccio-openid
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
    # scope: openid email groups # optional. custom scope, default is openid
    client-id: CLIENT_ID # required
    client-secret: CLIENT_SECRET # required
    username-claim: name # optional. username claim in openid, or key to get username in userinfo endpoint response, default is sub
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

## OpenID Callback URL

* Web UI: https://your-registry.com/-/oauth/callback
* CLI: https://your-registry.com/-/oauth/callback/cli

## Auth with CLI

```sh
npx verdaccio-openid@latest --registry http://your-registry.com
```
