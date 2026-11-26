---
"verdaccio-openid": patch
---

Stop naming the client script after the plugin version: the build emits one content-hashed file and records it in a manifest that is never served, and the page loads that file instead of `verdaccio-openid-<version>.js`. The hashed script is served with a one-year `immutable` cache policy, and the patched page is revalidated on every visit without overriding a stricter policy the host already set. The standalone status page no longer states the plugin version in its title. A published package ships only its own build's resources. Keep old hashed scripts on the shared origin across replicas until cached pages have moved over, then clear them.

<!-- zh-CN -->

客户端脚本不再按插件版本命名：构建产出一个内容哈希文件并记入不公开的 manifest，页面加载该文件而非 `verdaccio-openid-<version>.js`。哈希脚本附一年期 `immutable` 缓存；被改写的页面每次重新验证，不覆盖宿主已设的更严格策略。独立状态页的标题不再写插件版本。发布的包只带本次构建的资源。多副本部署时，先在共享源站保留旧哈希脚本，等已缓存的页面切过去再清理。
