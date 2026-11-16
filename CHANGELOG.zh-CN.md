# verdaccio-openid

## v0.19.1

_发布于 2026-11-16_

### Patch Changes

- "Configuration → Publishing" 里的空仓库引导现在也会被处理。此前替换密码登录时只处理了首页那份，Publishing 标签页仍然显示 `npm adduser`。此外，当上方命令被隐藏时，登录提示不再多出一段上边距。
- 收紧客户端对登录回跳参数的校验，并修正评审发现的提示文案。回跳链接里的 token 不是合法 token 时不再写入存储，token 命令改用单引号包裹而不是直接插值。畸形查询串不再导致登录按钮的接管失效。state 错误提示补充“可能已过期”，CLI 用法提示改为「a public npm registry or mirror」。
- 整理注入到 Configuration → Package Managers 与空 registry 引导页的使用说明。`npm adduser` 与 `npm profile set password` 现在只在当前会话用不上时才移除：使用 OpenID Connect 登录后始终移除，未登录且 `keep-passwd-login` 关闭时也移除。密码命令仍可见时，邀请以「或」的形式出现；密码命令被移除后则是普通提示。"No Package Published Yet" 引导同样处理：`keep-passwd-login` 关闭后，`npm adduser` 命令与其下方的 yarn 替代命令一并隐藏；登录后改为显示 token 命令。注入文案以及登录框里两个按钮之间的「或」现在跟随 Verdaccio 当前语言，提供英文、捷克语、德语、西班牙语、法语、爱尔兰语、加利西亚语、意大利语、韩语、波兰语、葡萄牙语、俄语、土耳其语、简体中文与繁体中文。
- 重新设计了密码登录弹窗中的 OpenID Connect 登录按钮（启用 `keepPasswdLogin` 时显示）。按钮改为整行描边样式，带锁图标，上方增加 "or" 分隔线，并补充了悬停与键盘焦点样式。配色使用继承的文字颜色和中性灰边框、背景。
- 调整插件自有页面与 CLI 上的提示文案。登录结果页标题改为「Login failed」「Success」「Access denied」，去掉表情符号，页面 logo 标记为装饰图以便读屏软件跳过；CLI 用法提示改为直述；配置与 token 相关错误信息更清楚；CLI 登录失败改为以错误级别输出。

## v0.19.0 (2026-09-15)

### Minor Changes

- 新增 MongoDB 存储后端，可通过 `store-type: mongodb` 让现有 MongoDB 部署在多副本环境中共享 OIDC 状态、用户信息、用户组和 WebAuthn token。项目的最低支持 Node.js 版本也已更新为 `>=20.19.0`。

### Patch Changes

- 在渲染登录按钮配置前对注入的登录选项值做了转义处理。这样在使用自定义登录文案或相关选项时，可以避免出现格式错误或不安全的注入值。
- 为 DynamoDB 存储配置增加了缺失值保护，并拆分了状态读取与缓存读取的一致性处理逻辑。这样在 DynamoDB 后端配置不完整时不会直接崩溃，同时也让读取行为更稳定、更可预测。

## 0.18.0

### ✨ 新功能

- **DynamoDB 存储后端** — 新增 `dynamodb` 存储类型，用于云原生多副本部署。OIDC 状态、用户信息、用户组和 WebAuthn token 持久化存储到共享的 DynamoDB 表中。可通过 `store-type: dynamodb` 配置，配合 `tableName`、`region` 和可选的 `partitionKey` 使用。(#20) 感谢 @ederelias 贡献此功能！
- **CLI 端口回退** — CLI 现在先尝试端口 `8239`，如果被占用则回退到 `18239`，不再直接报错。(#22)
- **OIDC 状态往返** — CLI 认证流程通过服务端 OIDC 状态追踪提升可靠性。(#22)

### ⚠️ 破坏性变更

- **Peer dependencies** — `ioredis` 和 `node-persist` 不再自动安装。如果你使用 `store-type: redis` 或 `store-type: file`，必须手动安装对应包：

  ```bash
  # Redis
  npm install ioredis

  # File
  npm install node-persist
  ```

  `in-memory` 存储（默认）无需额外安装。

### ♻️ 重构

- **构建工具** — 从 Rollup 迁移至 [tsdown](https://github.com/egoist/tsdown)。
- **代码检查与格式化** — 从 ESLint/Prettier 迁移至 [oxlint](https://oxc.rs/docs/guide/usage/linter.html)/[oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)，添加了 [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) pre-commit 钩子。
- **DynamoDB SDK** — 懒加载，并在缺少包时给出清晰的错误提示。
- **状态页面** — 重新设计，支持双主题、SVG 图标和卡片布局。(#23)
- **Logger** — 更新导出方式以保持 live binding，提升兼容性。
- **客户端常量** — 将客户端专用常量移入 `init.ts`，模块边界更清晰。

### 🐛 修复

- **DynamoDB 错误** — 原始 AWS SDK 错误现在会被捕获、分类（瞬时性 vs 永久性），并封装后再暴露到插件层。
- **Store 创建** — 为 store 初始化失败添加了错误处理。
- **状态页面** — 移除了 `buildSuccessPage` 输出中的 HTML 转义。
- **代码格式** — 修复了格式问题。

### 📝 文档

- **重组** — README.md 重写为精简版，详细内容按主题拆分到 `docs/`：
  - `configuration.md` — 所有配置选项、提供方发现、`keep-passwd-login`
  - `store-config.md` — Redis、File、DynamoDB 后端及 peer dependency 安装说明
  - `environment-variables.md` — 环境变量映射、dotenv 支持
  - `cli-auth.md` — CLI 登录流程
  - `development.md` — 构建、测试、项目结构
- **国际化** — 添加了完整中文翻译（`README.zh-CN.md`、`docs/zh-CN/`）。

### 🔧 杂项

- 更新依赖
- 更新 CI 矩阵中的 Node.js 版本
- 为之前未测试的模块添加了全面的测试
