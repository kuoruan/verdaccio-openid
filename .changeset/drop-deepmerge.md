---
"verdaccio-openid": patch
---

Merge the default security settings with a small local helper instead of `deepmerge`, dropping one runtime dependency. The defaults applied and the keys the host overrides are unchanged.

<!-- zh-CN -->

默认 security 配置改用本地小函数合并，不再依赖 `deepmerge`，减少一个运行时依赖。应用的默认值与宿主覆盖的键保持不变。
