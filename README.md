# verdaccio-openid

## About

This is a Verdaccio plugin that offers OIDC OAuth integration for both the browser and the command line.

### Compatibility

- Verdaccio 5, 6
- Node 16, 18
- Chrome, Firefox, Firefox ESR, Edge, Safari

## Setup

### Install

```sh
npm install -S verdaccio-openid
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
    # scope: openid email groups # optional. custom scope
    client-id: CLIENT_ID # required
    client-secret: CLIENT_SECRET # required
    username-claim: name # optional. default is sub
    groups-claim: groups # optional. claim to get groups from
    # provider-type: gitlab # optional. define this to get groups from gitlab api
    # authorized-group: false # optional. user in group is allowed to login, or false to disable
    # group-users: # optional. custom the group users. eg. animal group has user tom and jack. if set, 'groups-claim' and 'provider-type' take no effect
    #   animal:
    #     - tom
    #     - jack
```
