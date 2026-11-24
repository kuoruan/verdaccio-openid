---
"verdaccio-openid": minor
---

Harden how npm tokens are handled.

A token is no longer accepted where a password belongs: a legacy `npm login` that sends a token as its password is rejected. Verdaccio answers such a login with a new token, so a token could renew itself indefinitely without asking the provider.

Breaking changes: AES legacy tokens issued by older versions are rejected, and those users have to log in again. JWT npm tokens remain valid until they expire, but a legacy `npm login` no longer accepts one as its password; this covers `npm login --auth-type=legacy` and any other client that sends `_auth: base64(user:token)`, which have to send `_authToken` instead.

<!-- zh-CN -->

加固 npm token 的处理方式。

token 不再能当作密码使用：legacy `npm login` 若以 token 作为密码提交，会被拒绝。Verdaccio 会把这样的登录签发成一张新 token，token 因此可以在不询问提供方的情况下无限续期。

破坏性变更：旧版本签发的 AES legacy token 会被拒绝，这批用户需要重新登录。JWT npm token 仍可用到过期，但 legacy `npm login` 不再接受 token 作为密码；`npm login --auth-type=legacy` 以及其他把 token 放进 `_auth: base64(user:token)` 的客户端都受影响，需要改用 `_authToken`。
