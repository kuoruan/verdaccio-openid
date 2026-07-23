# 开发指南

## 前置条件

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10

## 环境搭建

```bash
git clone https://github.com/kuoruan/verdaccio-openid.git
cd verdaccio-openid
pnpm install
```

## 脚本

| 命令             | 说明                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `pnpm build`     | 使用 [tsdown](https://github.com/egoist/tsdown) 构建项目。                |
| `pnpm start`     | 启动 Verdaccio 6 并加载插件，用于本地测试。                               |
| `pnpm start:5`   | 启动 Verdaccio 5 并加载插件，用于兼容性测试。                             |
| `pnpm test`      | 使用 [Vitest](https://vitest.dev/) 运行测试。                             |
| `pnpm lint`      | 运行 [oxlint](https://oxc.rs/docs/guide/usage/linter.html)。              |
| `pnpm lint:fix`  | 自动修复 lint 问题。                                                      |
| `pnpm fmt`       | 使用 [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) 格式化代码。 |
| `pnpm fmt:check` | 检查格式但不写入。                                                        |

## 项目结构

```
src/
├── cli/              # CLI 工具（npx verdaccio-openid）
├── client/           # 插件提供的浏览器端 JS
│   └── plugin/       # 登录页面和 UI 逻辑
├── server/           # 服务端插件代码
│   ├── config/       # 配置解析与验证
│   ├── flows/        # OAuth 流程处理（Web、CLI、WebAuthn）
│   ├── openid/       # OpenID Connect 客户端和认证提供方
│   ├── plugin/       # Verdaccio 插件接口实现
│   └── store/        # 存储后端（in-memory、Redis、File、DynamoDB）
├── constants.ts      # 共享常量
└── paths.ts          # URL 路径工具
tests/                # Vitest 测试套件
verdaccio/            # Verdaccio 6 测试配置
verdaccio5/           # Verdaccio 5 测试配置
```

## 代码质量

本项目使用 [oxc](https://oxc.rs/) 工具链进行代码检查和格式化：

- **oxlint** — 零配置 linter（替代 ESLint）
- **oxfmt** — 快速格式化工具（替代 Prettier）

通过 pre-commit 钩子（[husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)）在暂存文件上自动运行 lint 和格式化。

## 测试

测试使用 [Vitest](https://vitest.dev/)，默认 Node.js 环境：

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
# Verdaccio 6
pnpm start

# Verdaccio 5
pnpm start:5
```

这会使用 `verdaccio/verdaccio.yml` 或 `verdaccio5/verdaccio.yml` 中的配置启动本地 registry。然后可以测试：

```bash
npm login --registry http://localhost:4873
```

> **注意**：端到端登录测试需要在 verdaccio 配置文件中配置真实的 OIDC 提供方。
