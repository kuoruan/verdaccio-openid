---
"verdaccio-openid": patch
---

Escape injected login option values before they are rendered into the login button configuration. This prevents malformed HTML or unsafe values from being passed through when custom login text or related options are used.

<!-- zh-CN -->

在渲染登录按钮配置前对注入的登录选项值做了转义处理。这样在使用自定义登录文案或相关选项时，可以避免出现格式错误或不安全的注入值。
