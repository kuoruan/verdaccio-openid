---
"verdaccio-openid": patch
---

Guard missing DynamoDB configuration during store setup and separate read-consistency handling for state and cache reads. This avoids crashes when the DynamoDB backend is configured incompletely and makes the store behavior more predictable for retryable reads.

<!-- zh-CN -->

为 DynamoDB 存储配置增加了缺失值保护，并拆分了状态读取与缓存读取的一致性处理逻辑。这样在 DynamoDB 后端配置不完整时不会直接崩溃，同时也让读取行为更稳定、更可预测。
