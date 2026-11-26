# 开发指南

## 前置条件

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 11

## 环境搭建

```bash
git clone https://github.com/kuoruan/verdaccio-openid.git
cd verdaccio-openid
pnpm install
```

## 脚本

| 命令               | 说明                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `pnpm build`       | 使用 [tsdown](https://github.com/egoist/tsdown) 构建项目。                |
| `pnpm changeset`   | 为面向用户的变更创建 changeset。                                          |
| `pnpm start`       | 启动 Verdaccio 7 并加载插件，用于本地测试。                               |
| `pnpm start:5`     | 启动 Verdaccio 5 并加载插件，用于兼容性测试。                             |
| `pnpm start:6`     | 启动 Verdaccio 6 并加载插件，用于兼容性测试。                             |
| `pnpm test`        | 使用 [Vitest](https://vitest.dev/) 运行测试。                             |
| `pnpm lint`        | 运行 [oxlint](https://oxc.rs/docs/guide/usage/linter.html)。              |
| `pnpm lint:fix`    | 自动修复 lint 问题。                                                      |
| `pnpm fmt`         | 使用 [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) 格式化代码。 |
| `pnpm fmt:check`   | 检查格式但不写入。                                                        |
| `pnpm run version` | 更新版本，并同时更新中英文 changelog。                                    |
| `pnpm release`     | 发布待处理的 changeset；由发布工作流使用。                                |

Changeset 应先写英文说明，再使用 `<!-- zh-CN -->` 标记添加中文说明。发布
工作流执行 `pnpm run version`，把英文条目写入 `CHANGELOG.md`、中文条目写入
`CHANGELOG.zh-CN.md`，两者都在同一个版本 PR 中。

`CHANGELOG.md` 只保留英文，`changesets/action` 只从它生成版本 PR 描述。
`scripts/release-notes.mjs` 把中文部分补到这两处：创建或更新版本 PR 时追加
到 PR 描述；发布任务则在 action 上设 `create-github-releases: false`，用两份
changelog 生成中英说明创建 Release。这一步可以重跑：已存在的 Release
不覆盖，tag 未推送的版本跳过。

## 项目结构

```
src/
├── cli/              # CLI 工具（npx verdaccio-openid）
├── client/           # 插件提供的浏览器端 JS：登录页面与 UI 逻辑
├── server/           # 服务端插件代码
│   ├── config/       # 配置解析与验证
│   ├── flows/        # OAuth 流程处理（Web、CLI、WebAuthn）
│   ├── openid/       # OpenID Connect 客户端和认证提供方
│   ├── plugin/       # Verdaccio 插件接口实现
│   └── store/        # 存储后端（in-memory、Redis、File、DynamoDB、MongoDB）
├── constants.ts      # 各产物共享的常量
├── paths.ts          # URL 路径工具
└── utils.ts          # 各产物共用的工具：HTML 转义、URL 校验、JSON
tests/                # Vitest 测试套件
verdaccio/            # Verdaccio 7 测试配置
verdaccio5/           # Verdaccio 5 测试配置
verdaccio6/           # Verdaccio 6 测试配置
```

## 代码质量

本项目使用 [oxc](https://oxc.rs/) 工具链进行代码检查和格式化：

- **oxlint** — 零配置 linter（替代 ESLint）
- **oxfmt** — 快速格式化工具（替代 Prettier）

通过 pre-commit 钩子（[husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)）在暂存文件上自动运行 lint 和格式化。

### 工具函数放哪里

- `src/utils.ts` — 只处理字符串、URL 与 JSON，服务端、CLI 与浏览器产物都可引用：转义、URL 校验、`safeJsonParse`/`safeJsonStringify`、空值判断。
- `src/server/utils.ts` — 模块加载相关（`interopDefault`、`importOptional`）。
- `src/server/crypto.ts` — 编码与签名：base64、HMAC、缓存键哈希、ID token 声明解析。
- `src/server/cookies.ts` — cookie 通用层，以及把登录绑定到发起它的浏览器的工具。
- `src/server/plugin/utils.ts` — 需要 Verdaccio 类型或 Express 请求的工具：组、基础 URL、包描述符。
- `src/server/config/utils.ts` — 配置解析相关工具。
- `src/server/store/utils.ts` — 存储取值相关工具：尺寸校验、会话与登录结果的解码。

常量按同样的范围归置：`src/constants.ts` 放各产物共享的部分（路径、插件标识、token 形态），`src/cli/constants.ts`、`src/server/constants.ts`、`src/server/store/constants.ts` 与 `src/client/constants.ts` 各放只有对应部分使用的常量。

写工具函数前先确认 Node 或现成依赖能否解决：`cookie` 负责解析 cookie，Express 负责写出 cookie，`node:util` 负责去除终端转义序列，`ms` 负责解析时长。

## 命名

类型、接口和枚举使用 `PascalCase`。其余常量按种类区分：

| 风格          | 适用                                                                                                 | 示例                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `UPPER_SNAKE` | 字面量表（`as const` 对象、`Set`、固定数组）以及文件内的固定字面量：正则、字节或长度上限、哨兵字符串 | `ERRORS`、`LOCAL_STORAGE_KEYS`、`PUBLIC_REGISTRIES`、`CONFIG_ENV_NAME_REGEX`、`MAX_KEY_BYTES` |
| `camelCase`   | 其余所有常量：DOM 选择器、id、类名、路径、端口、文案、CSS，以及任何由其他常量派生的值                | `loginButtonSelector`、`openIDStyleId`、`loginHref`、`npmLoginPath`、`pluginKey`              |

字面量表内部的下标保持 `UPPER_SNAKE`（如 `LOCAL_STORAGE_KEYS.USERNAME`），它们是表的条目，而不是独立常量。

## 测试

测试使用 [Vitest](https://vitest.dev/)，默认运行在 Node.js 环境；需要 DOM 的文件在第一行加 `// @vitest-environment jsdom` 注释即可切换：

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm vitest

# 运行指定测试文件
pnpm vitest tests/path/to/test.test.ts
```

## 本地 Verdaccio 测试

启动加载了插件的 Verdaccio：

```bash
# Verdaccio 7
pnpm start

# Verdaccio 5
pnpm start:5
```

这会使用 `verdaccio/verdaccio.yml` 或 `verdaccio5/verdaccio.yml` 中的配置启动本地 registry。然后可以测试：

```bash
npm login --registry http://localhost:4873
```

> **注意**：端到端登录测试需要在 verdaccio 配置文件中配置真实的 OIDC 提供方。
