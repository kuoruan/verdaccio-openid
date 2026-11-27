# CLI 认证

## 快速开始

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

如果已通过 `npm config set registry` 配置了 registry，可以省略 `--registry`。

执行后会打开浏览器窗口进行 OIDC 登录，成功后自动将 npm token 保存到 `.npmrc`。

使用 `--no-proxy` 可让 CLI 登录请求忽略代理环境变量并直接连接；该选项不改变浏览器的代理设置。仅在信任 registry 时使用 `--unsafe-urls`：该选项会跳过对返回的 `loginUrl` 与 `doneUrl` 的协议、凭据、origin 与路径检查。恶意 registry 可能把任意协议的 URL 交给系统打开，或让 CLI 轮询其他 origin 获取 token。该选项不会关闭 TLS 证书验证。

## 工作原理

1. CLI 向 registry 请求 Web 登录（`POST /-/v1/login`），在浏览器中打开返回的 `loginUrl`。
2. 轮询返回的 `doneUrl` 直到服务端给出 token（`202` 表示继续等，`200` 携带 token）。
3. CLI 将 token 保存到 `.npmrc` 并退出。

整个登录限时 60 秒。打开浏览器单独限时 5 秒：启动器卡住时，CLI 会打印登录 URL，可手动打开。轮询收到 `401` 表示登录已过期或被拒绝，随即结束。

registry 必须提供 `/-/v1/login`（插件 `0.14.0` 及之后版本），否则 CLI 报告登录请求失败并退出。

## 三条登录链路

插件提供三条登录链路，CLI 只走第三条。

| #   | 链路               | 客户端                                   | 服务端端点                                                                   | token 送达方式                                                                |
| --- | ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | 浏览器 Web UI 登录 | Chrome 97 及以上版本                     | `GET /-/oauth/authorize` → `GET /-/oauth/callback` → `POST /-/oauth/session` | 发起登录的浏览器凭登录 cookie 一次性取走凭据。                                |
| 2   | npm Web Authn 登录 | `npm login --auth-type=web`（npm 8.14+） | `POST /-/v1/login` → `GET /-/v1/done`                                        | npm 轮询 `doneUrl` 直到服务端给出 token。                                     |
| 3   | 插件 CLI 登录      | `npx verdaccio-openid`（本仓库）         | `POST /-/v1/login` → `GET /-/v1/done`                                        | 与链路 2 同一协议；CLI 轮询 `doneUrl` 并写入 `.npmrc`，不启动本地回调服务器。 |

服务端还保留一条旧链路：`GET /-/oauth/authorize/cli` + `GET /-/oauth/callback/cli`（`CliFlow`），曾把 token 重定向给 CLI `0.20.0` 及更早版本启动的本地回调服务器。该客户端不验证回调来源，服务端也不再为它签发 token：两条路由一律返回 `400` 和升级提示。保留注册只是让旧 CLI 与旧书签得到解释，而不是 `404`。

## 从 `0.20.0` 及更早版本的 CLI 升级

安装当前 CLI 并重新登录：

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

新版 CLI 对 `0.14.0` 及之后的服务端直接可用，所以 CLI 与服务端无需同时升级：先升级 CLI，再找时间升级服务端。

## 何时使用 CLI

npm 自身无法执行 Web Authn 登录时使用 CLI 认证，例如 npm 版本低于 v8.14.0。CLI 同样在浏览器中完成认证，因此不能替代浏览器。

## 兼容性

| CLI                               | 服务端          | 结果                                                                                                                    |
| --------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 新版（`web-login`）               | `0.14.0` 及之后 | 可用：`/-/v1/login` 自 `0.14.0` 起有应答，无需同步升级。                                                                |
| 新版（`web-login`）               | 早于 `0.14.0`   | 失败：该端点不存在，请升级服务端。                                                                                      |
| 旧版（`0.20.0` 及更早，本地回调） | `0.21.0` 及之后 | 失败：两条 loopback 路由一律返回升级提示，不再重定向 token。请升级到 `0.21.0` 或更新（`npx verdaccio-openid@latest`）。 |

本表描述当前版本的服务端。`0.14.0`–`0.20.x` 的服务端仍提供旧的 loopback 流程，旧 CLI 在其上仍可用，但这组组合保留了此次升级要关闭的缺陷：旧客户端不校验回调来源。

服务端收到旧的 `?port=N` 请求时返回 `400 This login flow is no longer supported: CLI 0.20.0 and older must upgrade to 0.21.0 or newer (npx verdaccio-openid@latest).`。
