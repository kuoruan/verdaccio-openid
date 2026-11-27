---
"verdaccio-openid": patch
---

Stop naming the client script after the plugin version: the build emits one content-hashed file and records it in a manifest that is never served, and the page loads that file instead of `verdaccio-openid-<version>.js`. The standalone status page no longer states the plugin version in its title. A published package ships only its own build's resources.

<!-- zh-CN -->

客户端脚本不再按插件版本命名：构建产出一个内容哈希文件并记入不公开的 manifest，页面加载该文件而非 `verdaccio-openid-<version>.js`。独立状态页的标题不再写插件版本。发布的包只带本次构建的资源。
