# Changelog (v0.18.0)

## ✨ Features

- **DynamoDB store backend** — new `dynamodb` store type for cloud-native multi-replica deployments. OIDC state, user info, groups, and WebAuthn tokens are persisted in a shared DynamoDB table. Configurable via `store-type: dynamodb` with `tableName`, `region`, and optional `partitionKey`. (#20) Thanks to @ederelias for contributing this feature!
- **CLI port fallback** — CLI now tries port `8239` first, then falls back to `18239` if busy, instead of failing immediately. (#22)
- **OIDC state round-trip** — CLI auth flow improved with server-side OIDC state tracking for better reliability. (#22)

## ⚠️ Breaking Changes

- **Peer dependencies** — `ioredis` and `node-persist` are no longer automatically installed. If you use `store-type: redis` or `store-type: file`, you must install the corresponding package(s) alongside the plugin:

  ```bash
  # Redis
  npm install ioredis

  # File
  npm install node-persist
  ```

  `in-memory` store (default) requires no additional packages.

## ♻️ Refactors

- **Build tooling** — migrated from Rollup to [tsdown](https://github.com/egoist/tsdown).
- **Lint & format** — migrated from ESLint/Prettier to [oxlint](https://oxc.rs/docs/guide/usage/linter.html)/[oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), added [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) pre-commit hooks.
- **DynamoDB SDK** — lazy-loaded with clear error messages when packages are missing.
- **Status page** — redesigned with dual-theme support, SVG icons, and card layout. (#23)
- **Logger** — export updated to maintain live binding for better compatibility.
- **Client constants** — moved client-only constants into `init.ts` for cleaner module boundaries.

## 🐛 Fixes

- **DynamoDB errors** — raw AWS SDK errors are now caught, classified (transient vs permanent), and wrapped before reaching the plugin layer.
- **Store creation** — error handling added for store initialization failures.
- **Status page** — HTML escaping removed from `buildSuccessPage` output.
- **Code format** — minor formatting fix.

## 📝 Documentation

- **Restructured** — README.md rewritten for conciseness; detailed content split into `docs/` by topic:
  - `configuration.md` — all config options, provider discovery, `keep-passwd-login`
  - `store-config.md` — Redis, File, DynamoDB backends with peer dependency instructions
  - `environment-variables.md` — env var mapping, dotenv support
  - `cli-auth.md` — CLI login flow
  - `development.md` — build, test, project structure
- **i18n** — full Chinese translations added (`README.zh-CN.md`, `docs/zh-CN/`).

## 🔧 Chores

- Update dependencies
- Update Node.js versions in CI matrix
- Comprehensive tests added for previously untested modules
