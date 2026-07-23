# CLI 认证

## 快速开始

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

如果已通过 `npm config set registry` 配置了 registry，可以省略 `--registry`。

执行后会打开浏览器窗口进行 OIDC 登录，成功后自动将 npm token 保存到 `.npmrc`。

## 工作原理

1. CLI 在端口 `8239` 上启动本地回调服务器（如果被占用则回退到 `18239`）。
2. 打开浏览器跳转到 registry 的 OIDC 授权 URL。
3. 在提供方完成认证后，registry 将 token 重定向回本地服务器。
4. CLI 将 token 保存到 `.npmrc` 并退出。

## 何时使用 CLI

当 Web Authn 不可用时使用 CLI 认证 — 例如 npm 版本低于 v8.14.0，或浏览器登录流程在你环境中不可行。
