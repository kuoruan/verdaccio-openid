# Development

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10

## Setup

```bash
git clone https://github.com/kuoruan/verdaccio-openid.git
cd verdaccio-openid
pnpm install
```

## Scripts

| Command          | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| `pnpm build`     | Build the project with [tsdown](https://github.com/egoist/tsdown).        |
| `pnpm start`     | Start Verdaccio 6 with the plugin for local testing.                      |
| `pnpm start:5`   | Start Verdaccio 5 with the plugin for compatibility testing.              |
| `pnpm test`      | Run tests with [Vitest](https://vitest.dev/).                             |
| `pnpm lint`      | Run [oxlint](https://oxc.rs/docs/guide/usage/linter.html).                |
| `pnpm lint:fix`  | Auto-fix lint issues.                                                     |
| `pnpm fmt`       | Format code with [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html). |
| `pnpm fmt:check` | Check formatting without writing.                                         |

## Project Structure

```
src/
├── cli/              # CLI tool (npx verdaccio-openid)
├── client/           # Browser-side JS served by the plugin
│   └── plugin/       # Login page and UI logic
├── server/           # Server-side plugin code
│   ├── config/       # Configuration parsing and validation
│   ├── flows/        # OAuth flow handlers (Web, CLI, WebAuthn)
│   ├── openid/       # OpenID Connect client and auth provider
│   ├── plugin/       # Verdaccio plugin interface implementation
│   └── store/        # Store backends (in-memory, Redis, File, DynamoDB)
├── constants.ts      # Shared constants
└── paths.ts          # URL path helpers
tests/                # Vitest test suites
verdaccio/            # Verdaccio 6 test config
verdaccio5/           # Verdaccio 5 test config
```

## Code Quality

This project uses the [oxc](https://oxc.rs/) toolchain for linting and formatting:

- **oxlint** — zero-config linter (replaces ESLint)
- **oxfmt** — fast formatter (replaces Prettier)

A pre-commit hook (via [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)) runs linting and formatting on staged files automatically.

## Testing

Tests use [Vitest](https://vitest.dev/) with the default Node.js environment:

```bash
# Run all tests
pnpm test

# Watch mode
pnpm vitest

# Run a specific test file
pnpm vitest tests/path/to/test.test.ts
```

## Local Testing with Verdaccio

Start Verdaccio with the plugin loaded:

```bash
# Verdaccio 6
pnpm start

# Verdaccio 5
pnpm start:5
```

This starts a local registry using the config in `verdaccio/verdaccio.yml` or `verdaccio5/verdaccio.yml`. You can then test against it:

```bash
npm login --registry http://localhost:4873
```

> **Note**: You'll need to configure a real OIDC provider in the verdaccio config file for end-to-end login testing.
