---
"verdaccio-openid": minor
---

Add a MongoDB-backed store via `store-type: mongodb` so OIDC state, user info, groups, and WebAuthn tokens can be shared across replicas with an existing MongoDB deployment. The project’s minimum supported Node.js version is now `>=20.19.0`.

<!-- zh-CN -->

新增 MongoDB 存储后端，可通过 `store-type: mongodb` 让现有 MongoDB 部署在多副本环境中共享 OIDC 状态、用户信息、用户组和 WebAuthn token。项目的最低支持 Node.js 版本也已更新为 `>=20.19.0`。
