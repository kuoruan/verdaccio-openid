---
"verdaccio-openid": minor
---

Honor `http_proxy`, `https_proxy` and `no_proxy` for outbound requests. The server reads them from the Verdaccio config; the CLI login reads them from its own environment.

Drop `@gitbeaker/rest`: GitLab groups are read page by page over that transport instead.

<!-- zh-CN -->

出站请求遵循 `http_proxy`、`https_proxy` 和 `no_proxy`：服务端从 Verdaccio 配置读取，CLI 登录从自身环境变量读取。

去掉 `@gitbeaker/rest`：GitLab 分组改经该传输逐页读取。
