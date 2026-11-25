---
"verdaccio-openid": minor
---

The CLI now logs in through npm's own web protocol (`POST /-/v1/login`, then open `loginUrl` and poll `doneUrl`), so the token travels over the polling connection the server answers instead of an unauthenticated local callback server. The protocol has been answered since `0.14.0`, so no lockstep upgrade is needed on this path; servers that predate the endpoint are not supported by this CLI.

The server no longer signs a token for the old loopback protocol: `GET /-/oauth/authorize/cli` and `GET /-/oauth/callback/cli` (`CliFlow`) answer `400 this login flow is no longer supported: CLI 0.20.0 and older must upgrade to 0.21.0 or newer (npx verdaccio-openid@latest)` and never redirect a token. CLI `0.20.0` and older used that path and accepted whatever token the callback carried without checking the caller, so only the client can close that gap. Upgrade the CLI with `npx verdaccio-openid@latest`; a new CLI works against any server since `0.14.0`, so the CLI and the server do not have to be upgraded together. This is a breaking change for the old CLI, which is why the release is `0.21.0` rather than a patch.

<!-- zh-CN -->

CLI 改走 npm 自身的 Web 登录协议（`POST /-/v1/login`，打开 `loginUrl` 并轮询 `doneUrl`）：token 经服务端应答的轮询连接返回，不再经过无身份验证的本地回调服务器。该协议自 `0.14.0` 起已有应答，这条路径无需同步升级；更早的服务端没有该端点，不在此 CLI 支持范围内。

服务端不再为旧的本地回调协议签发 token：`GET /-/oauth/authorize/cli` 与 `GET /-/oauth/callback/cli`（`CliFlow`）一律返回 `400 this login flow is no longer supported: CLI 0.20.0 and older must upgrade to 0.21.0 or newer (npx verdaccio-openid@latest)`，不再重定向 token。CLI `0.20.0` 及更早版本使用该链路，且不校验回调来源就接受其中携带的 token，这个缺口只能由客户端关闭。请用 `npx verdaccio-openid@latest` 升级 CLI；新版 CLI 对 `0.14.0` 及之后的服务端直接可用，两者无需同时升级。这对旧 CLI 是破坏性变更，因此发布为 `0.21.0` 而非补丁版本。
