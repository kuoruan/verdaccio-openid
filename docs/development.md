# Development

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.19.0
- [pnpm](https://pnpm.io/) >= 11

## Setup

```bash
git clone https://github.com/kuoruan/verdaccio-openid.git
cd verdaccio-openid
pnpm install
```

## Scripts

| Command            | Description                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| `pnpm build`       | Build the project with [tsdown](https://github.com/egoist/tsdown).        |
| `pnpm changeset`   | Create a changeset for a user-facing change.                              |
| `pnpm start`       | Start Verdaccio 7 with the plugin for local testing.                      |
| `pnpm start:5`     | Start Verdaccio 5 with the plugin for compatibility testing.              |
| `pnpm test`        | Run tests with [Vitest](https://vitest.dev/).                             |
| `pnpm lint`        | Run [oxlint](https://oxc.rs/docs/guide/usage/linter.html).                |
| `pnpm lint:fix`    | Auto-fix lint issues.                                                     |
| `pnpm fmt`         | Format code with [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html). |
| `pnpm fmt:check`   | Check formatting without writing changes.                                 |
| `pnpm run version` | Update package versions and generate the English and Chinese changelogs.  |
| `pnpm release`     | Publish pending changesets in the release workflow.                       |

Changesets should include an English summary followed by a Chinese section marked with `<!-- zh-CN -->`. The release workflow runs `pnpm run version` and updates `CHANGELOG.zh-CN.md` in the same version PR.

## Project structure

```text
src/
├── cli/              # CLI tool (npx verdaccio-openid)
├── client/           # Browser-side JS served by the plugin
│   └── plugin/       # Login page and UI logic
├── server/           # Server-side plugin code
│   ├── config/       # Configuration parsing and validation
│   ├── flows/        # OAuth flow handlers (Web, CLI, WebAuthn)
│   ├── openid/       # OpenID Connect client and auth provider
│   ├── plugin/       # Verdaccio plugin interface implementation
│   └── store/        # Store backends (in-memory, Redis, file, DynamoDB, MongoDB)
├── constants.ts      # Shared constants
└── paths.ts          # URL path helpers
tests/                # Vitest test suites
verdaccio/            # Verdaccio 7 test config
verdaccio5/           # Verdaccio 5 test config
```

## Code quality

This project uses the [oxc](https://oxc.rs/) toolchain for linting and formatting:

- `oxlint` — zero-config linter, replacing ESLint
- `oxfmt` — fast formatter, replacing Prettier

A pre-commit hook powered by [husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) runs linting and formatting on staged files automatically.

## Naming

Types, interfaces and enums use `PascalCase`. Everything else follows the kind of constant it is:

| Style         | Used for                                                                                                                                  | Examples                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `UPPER_SNAKE` | Literal tables (`as const` objects, `Set`s, fixed arrays) and file-local fixed literals: regexes, byte or length limits, sentinel strings | `ERRORS`, `LOCAL_STORAGE_KEYS`, `PUBLIC_REGISTRIES`, `CONFIG_ENV_NAME_REGEX`, `MAX_KEY_BYTES` |
| `camelCase`   | Every other constant: DOM selectors, ids, class names, paths, ports, messages, CSS, and anything derived from another constant            | `loginButtonSelector`, `openIDStyleId`, `loginHref`, `cliPort`, `pluginKey`                   |

Keys inside a literal table stay `UPPER_SNAKE` (`LOCAL_STORAGE_KEYS.USERNAME`), since they are entries of that table rather than standalone constants.

## Testing

Tests use [Vitest](https://vitest.dev/) with the default Node.js environment. Files that need the DOM opt in with a `// @vitest-environment jsdom` comment on the first line:

```bash
# Run all tests
pnpm test

# Watch mode
pnpm vitest

# Run a specific test file
pnpm vitest tests/path/to/test.test.ts
```

## Local testing with Verdaccio

Start Verdaccio with the plugin loaded:

```bash
# Verdaccio 7
pnpm start

# Verdaccio 5
pnpm start:5
```

This starts a local registry using the config in `verdaccio/verdaccio.yml` or `verdaccio5/verdaccio.yml`. You can then test against it with:

```bash
npm login --registry http://localhost:4873
```

> Note: you still need a real OIDC provider configured in the Verdaccio config for end-to-end login testing.
