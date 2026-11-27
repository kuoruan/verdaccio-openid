---
"verdaccio-openid": patch
---

Treat only plain objects as objects when reading JSON: an array read back from the user info cache, or passed to `setUserInfo`, is now rejected instead of being used as a record.

<!-- zh-CN -->

读取 JSON 时只把纯对象当作对象：从用户信息缓存读回的数组、或传给 `setUserInfo` 的数组，现在会被拒绝，而不再当作记录使用。
