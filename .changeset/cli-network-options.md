---
"verdaccio-openid": minor
---

Add `--no-proxy` to connect without environment proxies and `--unsafe-urls` to skip the protocol, credentials, origin, and path checks on the returned login and token URLs. Use `--unsafe-urls` only with a trusted registry: a malicious one could pass a URL of any scheme to the system opener or make the CLI poll another origin for a token. TLS certificate verification stays enabled.

<!-- zh-CN -->

新增 `--no-proxy`，用于忽略代理环境变量，直接连接；新增 `--unsafe-urls`，用于跳过对返回的登录与 token URL 的协议、凭据、origin 与路径检查。`--unsafe-urls` 仅用于信任的 registry：恶意 registry 可能把任意协议的 URL 交给系统打开，或让 CLI 轮询其他 origin 获取 token。TLS 证书验证仍然启用。
