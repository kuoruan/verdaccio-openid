---
"verdaccio-openid": patch
---

Group the store interface into domain slices (`OpenIDStateStore`, `ProviderCache`, `WebAuthnStore`, `LoginResultStore`) so each flow depends only on the slice it uses. The login result is now a typed object instead of a JSON string: backends serialize it and reject corrupted rows as a miss, and a WebAuthn session is a `pending`/`ready` value so a pending login can never be consumed. Misses read as `undefined` everywhere, and the optional cache methods are required. Storage layout is unchanged except for Redis user info rows: they used to be hashes (which stringified arrays and nested objects) and are now JSON strings. A row written by the old version reads as a miss once and is then replaced; do not mix versions against the same Redis database during the rollout.

<!-- zh-CN -->

将 store 接口按领域切分为 `OpenIDStateStore`、`ProviderCache`、`WebAuthnStore`、`LoginResultStore` 四片，每条登录链路只依赖自己用的那片。登录结果改为类型化对象而非 JSON 字符串：序列化下沉到后端，损坏的行按未命中处理；WebAuthn 会话是 `pending`/`ready` 取值，未完成的登录取不走。各处未命中统一为 `undefined`，缓存方法不再可选。除 Redis user info 行外存储格式不变：它之前是 hash（会把数组和嵌套对象压成字符串），现在是 JSON 字符串。旧版本写入的行会被读成一次未命中然后替换；升级期间不要让新旧版本共用同一个 Redis 库。
