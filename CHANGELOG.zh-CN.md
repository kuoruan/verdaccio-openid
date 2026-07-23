# 更新日志 (v0.18.0)

## ✨ 新功能

- **DynamoDB 存储后端** — 新增 `dynamodb` 存储类型，用于云原生多副本部署。OIDC 状态、用户信息、用户组和 WebAuthn token 持久化存储到共享的 DynamoDB 表中。可通过 `store-type: dynamodb` 配置，配合 `tableName`、`region` 和可选的 `partitionKey` 使用。(#20) 感谢 @ederelias 贡献此功能！
- **CLI 端口回退** — CLI 现在先尝试端口 `8239`，如果被占用则回退到 `18239`，不再直接报错。(#22)
- **OIDC 状态往返** — CLI 认证流程通过服务端 OIDC 状态追踪提升可靠性。(#22)

## ⚠️ 破坏性变更

- **Peer dependencies** — `ioredis` 和 `node-persist` 不再自动安装。如果你使用 `store-type: redis` 或 `store-type: file`，必须手动安装对应包：

  ```bash
  # Redis
  npm install ioredis

  # File
  npm install node-persist
  ```

  `in-memory` 存储（默认）无需额外安装。

## ♻️ 重构

- **构建工具** — 从 Rollup 迁移至 [tsdown](https://github.com/egoist/tsdown)。
- **代码检查与格式化** — 从 ESLint/Prettier 迁移至 [oxlint](https://oxc.rs/docs/guide/usage/linter.html)/[oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)，添加了 [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) pre-commit 钩子。
- **DynamoDB SDK** — 懒加载，并在缺少包时给出清晰的错误提示。
- **状态页面** — 重新设计，支持双主题、SVG 图标和卡片布局。(#23)
- **Logger** — 更新导出方式以保持 live binding，提升兼容性。
- **客户端常量** — 将客户端专用常量移入 `init.ts`，模块边界更清晰。

## 🐛 修复

- **DynamoDB 错误** — 原始 AWS SDK 错误现在会被捕获、分类（瞬时性 vs 永久性），并封装后再暴露到插件层。
- **Store 创建** — 为 store 初始化失败添加了错误处理。
- **状态页面** — 移除了 `buildSuccessPage` 输出中的 HTML 转义。
- **代码格式** — 修复了格式问题。

## 📝 文档

- **重组** — README.md 重写为精简版，详细内容按主题拆分到 `docs/`：
  - `configuration.md` — 所有配置选项、提供方发现、`keep-passwd-login`
  - `store-config.md` — Redis、File、DynamoDB 后端及 peer dependency 安装说明
  - `environment-variables.md` — 环境变量映射、dotenv 支持
  - `cli-auth.md` — CLI 登录流程
  - `development.md` — 构建、测试、项目结构
- **国际化** — 添加了完整中文翻译（`README.zh-CN.md`、`docs/zh-CN/`）。

## 🔧 杂项

- 更新依赖
- 更新 CI 矩阵中的 Node.js 版本
- 为之前未测试的模块添加了全面的测试
