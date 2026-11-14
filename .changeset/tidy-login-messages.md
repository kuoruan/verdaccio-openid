---
"verdaccio-openid": patch
---

Reword the messages the plugin shows on its own pages and in the CLI. The login outcome pages now lead with "Login failed", "Success", and "Access denied" instead of emoticons, and the logo on those pages is marked as decorative so screen readers skip it. The CLI usage hint reads plainly, the configuration and token error messages are clearer, and a failed CLI login is reported as an error rather than a warning.

<!-- zh-CN -->

调整插件自有页面与 CLI 上的提示文案。登录结果页标题改为「Login failed」「Success」「Access denied」，去掉表情符号，页面 logo 标记为装饰图以便读屏软件跳过；CLI 用法提示改为直述；配置与 token 相关错误信息更清楚；CLI 登录失败改为以错误级别输出。
