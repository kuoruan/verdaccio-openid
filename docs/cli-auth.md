# CLI authentication

## Quick start

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

If you already configured the registry with `npm config set registry`, you can skip the `--registry` flag.

This opens a browser window for OIDC login. When login succeeds, the npm token is saved to your `.npmrc` automatically.

Use `--no-proxy` to make CLI login requests directly, ignoring proxy environment variables; this does not change the browser's proxy settings. Use `--unsafe-urls` only with a trusted registry: it disables the protocol, credentials, origin, and path checks on the returned `loginUrl` and `doneUrl`. A malicious registry could pass a URL of any scheme to the system opener or make the CLI poll another origin for a token. It does not disable TLS certificate verification.

## How it works

1. The CLI asks the registry for a web login (`POST /-/v1/login`) and opens the returned `loginUrl` in your browser.
2. It polls the returned `doneUrl` until the server reports the token (`202` means keep waiting, `200` carries the token).
3. The CLI saves the token to `.npmrc` and exits.

The whole login is bounded by 60 seconds. Opening the browser gets its own 5-second bound: if the launcher hangs, the CLI prints the login URL so you can open it manually. Polling ends with `401` when the login expired or was rejected.

The registry must offer `/-/v1/login` (plugin `0.14.0` or newer); otherwise the CLI reports the failed login request and exits.

## Three login paths

The plugin serves three login paths. The CLI only uses the third one.

| #   | Path                 | Client                                  | Server endpoints                                                             | Token delivery                                                                                  |
| --- | -------------------- | --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Browser Web UI login | Chrome 97 or later                      | `GET /-/oauth/authorize` → `GET /-/oauth/callback` → `POST /-/oauth/session` | The browser that started the flow collects the credentials once, bound by the login cookie.     |
| 2   | npm Web Authn login  | `npm login --auth-type=web` (npm 8.14+) | `POST /-/v1/login` → `GET /-/v1/done`                                        | npm polls `doneUrl` until the server reports the token.                                         |
| 3   | Plugin CLI login     | `npx verdaccio-openid` (this repo)      | `POST /-/v1/login` → `GET /-/v1/done`                                        | Same protocol as path 2; the CLI polls `doneUrl` and writes `.npmrc`. No local callback server. |

An older, fourth path exists only on the server: `GET /-/oauth/authorize/cli` + `GET /-/oauth/callback/cli` (`CliFlow`), which used to redirect the token to a loopback callback server started by CLI `0.20.0` and older. That client verified nothing about the callback sender, and the server no longer signs a token for it: both routes answer `400` with an upgrade message. They stay registered so an old CLI or a bookmark gets an explanation instead of a `404`.

## Upgrading from a CLI `0.20.0` or older

Install the current CLI and log in again:

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

A new CLI works against any server since `0.14.0`, so the CLI and the server do not have to be upgraded at the same time: upgrade the CLI first, then the server when convenient.

## When to use the CLI

Use the CLI flow when npm cannot run its own Web Authn login, such as with npm versions older than v8.14.0. It authenticates in a browser too, so it does not replace a browser.

## Compatibility

| CLI                                      | Server              | Result                                                                                                                                                       |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| new (`web-login`)                        | `0.14.0` or newer   | Works: `/-/v1/login` answers since `0.14.0`, no lockstep upgrade.                                                                                            |
| new (`web-login`)                        | older than `0.14.0` | Fails: the endpoint does not exist; upgrade the server.                                                                                                      |
| old (`0.20.0` and older, local callback) | `0.21.0` or newer   | Fails: both loopback routes answer with an upgrade message and never redirect a token. Upgrade the CLI to `0.21.0` or newer (`npx verdaccio-openid@latest`). |

This table describes the current server release. Servers `0.14.0`–`0.20.x` still serve the old loopback flow, so an old CLI keeps working there — but that pairing keeps the flaw this upgrade closes: the old client accepts any callback sender.

A server that receives the old `?port=N` request answers `400 this login flow is no longer supported: CLI 0.20.0 and older must upgrade to 0.21.0 or newer (npx verdaccio-openid@latest)`.
