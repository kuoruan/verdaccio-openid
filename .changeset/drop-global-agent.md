---
"verdaccio-openid": patch
---

Drop `global-agent`: outbound requests already go through the per-instance proxy transport. The server and the CLI login log the proxy configuration in use, with credentials hidden, and stay silent when no proxy is configured.

<!-- zh-CN -->

去掉 `global-agent`：出站请求已走按实例创建的代理传输。服务端与 CLI 登录在使用代理时会记录脱敏后的代理配置，未使用时不输出。
