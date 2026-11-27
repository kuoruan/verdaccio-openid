# verdaccio-openid

## v0.21.0

_发布于 2026-11-27_

### Minor Changes

- 登录凭证不再放在重定向 URL 里，而是交给发起登录的浏览器：HttpOnly cookie 绑定浏览器，重定向只带一次性 code，浏览器再用同源 `POST /-/oauth/session` 出示该 cookie 领取凭证。npm WebAuth 登录同样绑定。待领取的凭证存放在所配存储的独立 key 下；Redis、MongoDB 和 DynamoDB 以一次操作取出并删除，in-memory 仅覆盖本进程，file 后端先读后删且无锁，单进程使用。
- 新增 `--no-proxy`，用于忽略代理环境变量，直接连接；新增 `--unsafe-urls`，用于跳过对返回的登录与 token URL 的协议、凭据、origin 与路径检查。`--unsafe-urls` 仅用于信任的 registry：恶意 registry 可能把任意协议的 URL 交给系统打开，或让 CLI 轮询其他 origin 获取 token。TLS 证书验证仍然启用。
- CLI 改走 npm 自身的 Web 登录协议（`POST /-/v1/login`，打开 `loginUrl` 并轮询 `doneUrl`）：token 经服务端应答的轮询连接返回，不再经过无身份验证的本地回调服务器。该协议自 `0.14.0` 起已有应答，这条路径无需同步升级；更早的服务端没有该端点，不在此 CLI 支持范围内。 服务端不再为旧的本地回调协议签发 token：`GET /-/oauth/authorize/cli` 与 `GET /-/oauth/callback/cli`（`CliFlow`）一律返回 `400 this login flow is no longer supported: CLI 0.20.0 and older must upgrade to 0.21.0 or newer (npx verdaccio-openid@latest)`，不再重定向 token。CLI `0.20.0` 及更早版本使用该链路，且不校验回调来源就接受其中携带的 token，这个缺口只能由客户端关闭。请用 `npx verdaccio-openid@latest` 升级 CLI；新版 CLI 对 `0.14.0` 及之后的服务端直接可用，两者无需同时升级。这对旧 CLI 是破坏性变更，因此发布为 `0.21.0` 而非补丁版本。
- 出站请求遵循 `http_proxy`、`https_proxy` 和 `no_proxy`：服务端从 Verdaccio 配置读取，CLI 登录从自身环境变量读取。 去掉 `@gitbeaker/rest`：GitLab 分组改经该传输逐页读取。
- GitLab 组按完整路径而非组名匹配。 `provider-type: gitlab` 时用户组取自组名，但组名不唯一、也不保留：有建组权限的人可以建一个与目标组同名的组来匹配 `authorized-groups`。现在组取自 GitLab 保证唯一的完整路径（`team/backend`，顶层组为 `backend`）。 组名不是完整路径的配置需要更新。顶层组不受影响，因为名称与路径通常一致。位于 `team` 下、配置为 `backend` 的组，需要在 `auth` 与 `middlewares` 两个 section 的 `authorized-groups` 和 `group-users` 里都改成 `team/backend`。

### Patch Changes

- 客户端脚本不再按插件版本命名：构建产出一个内容哈希文件并记入不公开的 manifest，页面加载该文件而非 `verdaccio-openid-<version>.js`。独立状态页的标题不再写插件版本。发布的包只带本次构建的资源。
- 默认 security 配置改用本地小函数合并，不再依赖 `deepmerge`，减少一个运行时依赖。应用的默认值与宿主覆盖的键保持不变。
- 去掉 `global-agent`：出站请求已走按实例创建的代理传输。服务端与 CLI 登录在使用代理时会记录脱敏后的代理配置，未使用时不输出。
- 用 `node:util` 的 `parseArgs` 取代 `minimist` 依赖。
- 加固登录周边的环节而非登录本身：页面转义展示内容，回退链接只留在本站；CLI 在打印服务端消息前清除终端控制序列；未设置的 store `ttl` 不再传入，无效的 `ttl` 直接报配置错误；file 存储目录保持 `0700`；不再记录代理密码；Redis 用户信息以 JSON 存取。 新的 web 登录路径（见 `cli-web-login` changeset）对 `0.14.0` 及之后的服务端直接可用，无需同步升级。
- 读取 JSON 时只把纯对象当作对象：从用户信息缓存读回的数组、或传给 `setUserInfo` 的数组，现在会被拒绝，而不再当作记录使用。
- 构建时压缩客户端和状态页的内联 CSS，并优化客户端登录图标。
- 将 store 接口按领域切分为 `OpenIDStateStore`、`ProviderCache`、`WebAuthnStore`、`LoginResultStore` 四片，每条登录链路只依赖自己用的那片。登录结果改为类型化对象而非 JSON 字符串：序列化下沉到后端，损坏的行按未命中处理；WebAuthn 会话是 `pending`/`ready` 取值，未完成的登录取不走。各处未命中统一为 `undefined`，缓存方法不再可选。除 Redis user info 行外存储格式不变：它之前是 hash（会把数组和嵌套对象压成字符串），现在是 JSON 字符串。旧版本写入的行会被读成一次未命中然后替换；升级期间不要让新旧版本共用同一个 Redis 库。
- 使用 `body-parser` 解析 JSON 请求体，不再在运行时依赖 Express。

## v0.20.0

_发布于 2026-11-24_

### Minor Changes

- 加固 npm token 的处理方式。 token 不再能当作密码使用：legacy `npm login` 若以 token 作为密码提交，会被拒绝。Verdaccio 会把这样的登录签发成一张新 token，token 因此可以在不询问提供方的情况下无限续期。 破坏性变更：旧版本签发的 AES legacy token 会被拒绝，这批用户需要重新登录。JWT npm token 仍可用到过期，但 legacy `npm login` 不再接受 token 作为密码；`npm login --auth-type=legacy` 以及其他把 token 放进 `_auth: base64(user:token)` 的客户端都受影响，需要改用 `_authToken`。

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
