# verdaccio-openid

[![npm](https://img.shields.io/npm/v/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dw/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/dt/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)
[![npm](https://img.shields.io/npm/l/verdaccio-openid.svg)](https://www.npmjs.com/package/verdaccio-openid)

[English](README.md) | 中文

## 简介

verdaccio-openid 为 Verdaccio 增加了 OpenID Connect 登录支持，同时覆盖浏览器端和命令行端。

## 兼容性

- Verdaccio 5、6、7
- Node >= 20.19.0
- 支持 [ES6](https://caniuse.com/?search=es6) 的浏览器

## 安装

### 全局安装

```sh
npm install -g verdaccio-openid
```

### 安装到 Verdaccio 的插件目录

```bash
mkdir -p ./install-here/
npm install --global-style \
  --bin-links=false --save=false --package-lock=false \
  --omit=dev --omit=optional --omit=peer \
  --prefix ./install-here/ \
  verdaccio-openid@latest
mv ./install-here/node_modules/verdaccio-openid/ /path/to/verdaccio/plugins/
```

## 配置

把下面的内容加入 Verdaccio 配置文件：

```yaml
middlewares:
  openid:
    enabled: true

auth:
  openid:
    provider-host: https://example.com
    client-id: CLIENT_ID
    client-secret: CLIENT_SECRET
    username-claim: name
    # scope: openid email groups
    # groups-claim: groups
    # provider-type: gitlab
    # store-type: file
    # store-config: ./store
    # authorized-groups:
    #   - access
    # group-users:
    #   animal:
    #     - tom
    #     - jack
```

### 必填选项

| 配置项          | 说明                      |
| --------------- | ------------------------- |
| `provider-host` | OIDC 提供方的主机地址。   |
| `client-id`     | OIDC 提供方的客户端 ID。  |
| `client-secret` | OIDC 提供方的客户端密钥。 |

查看 [配置](docs/zh-CN/configuration.md) 了解完整选项列表。

## OpenID 回调地址

在 OIDC 提供方中配置这些回调地址：

| 流程      | 回调地址                                           |
| --------- | -------------------------------------------------- |
| Web Authn | `https://your-registry.com/-/oauth/callback/authn` |
| Web UI    | `https://your-registry.com/-/oauth/callback`       |
| CLI       | `https://your-registry.com/-/oauth/callback/cli`   |

## 认证

### Web UI

完成配置后，点击登录按钮会把用户带到 OIDC 提供方。

如果配置了 `auth.htpasswd.file`，登录页会先显示用户名和密码表单，OIDC 登录按钮则放在下面，让用户可以选择任一登录方式。

![登录对话框](docs/images/login-dialog.png)

可以显式设置 `keep-passwd-login` 来覆盖自动检测逻辑。详见 [keep-passwd-login](docs/zh-CN/configuration.md#keep-passwd-login)。

### Web Authn（推荐）

```sh
npm login --registry http://your-registry.com
```

这会打开浏览器窗口进行 OIDC 登录，并自动保存 token。

> 注意：npm v9+ 默认带上了 `--auth-type=web`。对于 npm v8.14 到 v8.x，需要显式加上 `--auth-type=web`。npm 低于 v8.14 时，请使用旧流程：
>
> ```sh
> npm login --auth-type=legacy --registry http://your-registry.com
> ```
>
> 详情见 [npm 文档](https://docs.npmjs.com/accessing-npm-using-2fa#sign-in-from-the-command-line-using---auth-typeweb)。

### CLI（备选）

```sh
npx verdaccio-openid@latest --registry http://your-registry.com
```

它会使用本地回调服务器接收 token。当 Web Authn 不可用时（例如旧版 npm）会回退到这个流程。详见 [CLI 认证](docs/zh-CN/cli-auth.md)。

## 存储后端

为会话状态和缓存选择合适的后端：

| 类型                | 适用场景                  |
| ------------------- | ------------------------- |
| `in-memory`（默认） | 单进程开发                |
| `redis`             | 多副本部署                |
| `file`              | 单节点持久化              |
| `dynamodb`          | 云原生多副本部署          |
| `mongodb`           | 依赖 MongoDB 的多副本部署 |

详见 [存储配置](docs/zh-CN/store-config.md) 了解各后端的安装步骤和 peer dependency 要求。

## 环境变量

大多数配置项都可以通过环境变量设置，这样能把敏感信息留在配置文件之外。详见 [环境变量](docs/zh-CN/environment-variables.md) 了解命名规则和 dotenv 支持。

## 贡献

详见 [开发指南](docs/zh-CN/development.md) 了解构建、测试和项目结构。

## 文档

- [配置](docs/zh-CN/configuration.md) — 完整配置项和 provider discovery
- [存储配置](docs/zh-CN/store-config.md) — Redis、File、DynamoDB 和 MongoDB 后端
- [环境变量](docs/zh-CN/environment-variables.md) — 环境变量命名和 dotenv 支持
- [CLI 认证](docs/zh-CN/cli-auth.md) — CLI 登录流程
- [开发指南](docs/zh-CN/development.md) — 构建、测试和项目结构

## 许可证

MIT
