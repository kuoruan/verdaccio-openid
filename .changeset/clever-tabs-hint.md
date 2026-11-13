---
"verdaccio-openid": patch
---

Tidy the usage info injected into Configuration → Package Managers and the empty-registry guide. `npm adduser` and `npm profile set password` are now removed whenever they cannot work with the current session: always after an OpenID Connect login, and for anonymous users when `keep-passwd-login` is disabled. Where the password commands stay visible, the invitation is framed as an alternative to them; where they are gone, it is a plain hint. The same applies to the "No Package Published Yet" guide: its `npm adduser` command and the yarn alternative below it are hidden once password login is gone, and the token command is shown after a login. The injected text and the `or` between the two login buttons now follow the language Verdaccio is set to, and ship English, Czech, German, Spanish, French, Irish, Galician, Italian, Korean, Polish, Portuguese, Russian, Turkish, Simplified Chinese and Traditional Chinese.

<!-- zh-CN -->

整理注入到 Configuration → Package Managers 与空 registry 引导页的使用说明。`npm adduser` 与 `npm profile set password` 现在只在当前会话用不上时才移除：使用 OpenID Connect 登录后始终移除，未登录且 `keep-passwd-login` 关闭时也移除。密码命令仍可见时，邀请以「或」的形式出现；密码命令被移除后则是普通提示。"No Package Published Yet" 引导同样处理：`keep-passwd-login` 关闭后，`npm adduser` 命令与其下方的 yarn 替代命令一并隐藏；登录后改为显示 token 命令。注入文案以及登录框里两个按钮之间的「或」现在跟随 Verdaccio 当前语言，提供英文、捷克语、德语、西班牙语、法语、爱尔兰语、加利西亚语、意大利语、韩语、波兰语、葡萄牙语、俄语、土耳其语、简体中文与繁体中文。
