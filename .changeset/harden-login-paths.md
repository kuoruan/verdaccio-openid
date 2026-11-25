---
"verdaccio-openid": patch
---

Harden the pieces around the login rather than the login itself: pages escape what they show and the back link stays on this registry; the CLI strips terminal escape sequences before it prints a server message; an unset store `ttl` is left out and an invalid one is a configuration error; the file store keeps its directory at `0700`; proxy passwords are no longer logged; the Redis store keeps user info as JSON.

The new web-login path (see the `cli-web-login` changeset) works against any server since `0.14.0` with no lockstep upgrade.

<!-- zh-CN -->

加固登录周边的环节而非登录本身：页面转义展示内容，回退链接只留在本站；CLI 在打印服务端消息前清除终端控制序列；未设置的 store `ttl` 不再传入，无效的 `ttl` 直接报配置错误；file 存储目录保持 `0700`；不再记录代理密码；Redis 用户信息以 JSON 存取。

新的 web 登录路径（见 `cli-web-login` changeset）对 `0.14.0` 及之后的服务端直接可用，无需同步升级。
