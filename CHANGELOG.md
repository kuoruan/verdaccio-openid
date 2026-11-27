# verdaccio-openid

## 0.21.0

_Released 2026-11-27_

### Minor Changes

- Hand the UI credentials to the browser instead of putting them in the redirect URL: the login is bound to the browser that started it with an HttpOnly cookie, the redirect carries a single-use code, and the credentials are fetched with a same-origin `POST /-/oauth/session` that presents that cookie. The npm WebAuth login is bound the same way. Pending credentials live under their own key in the configured store; Redis, MongoDB and DynamoDB consume them in one operation, the in-memory store only covers its own process, and the file store reads and then deletes without a lock, so use it with a single Verdaccio process.
- Add `--no-proxy` to connect without environment proxies and `--unsafe-urls` to skip the protocol, credentials, origin, and path checks on the returned login and token URLs. Use `--unsafe-urls` only with a trusted registry: a malicious one could pass a URL of any scheme to the system opener or make the CLI poll another origin for a token. TLS certificate verification stays enabled.
- The CLI now logs in through npm's own web protocol (`POST /-/v1/login`, then open `loginUrl` and poll `doneUrl`), so the token travels over the polling connection the server answers instead of an unauthenticated local callback server. The protocol has been answered since `0.14.0`, so no lockstep upgrade is needed on this path; servers that predate the endpoint are not supported by this CLI. The server no longer signs a token for the old loopback protocol: `GET /-/oauth/authorize/cli` and `GET /-/oauth/callback/cli` (`CliFlow`) answer `400 this login flow is no longer supported: CLI 0.20.0 and older must upgrade to 0.21.0 or newer (npx verdaccio-openid@latest)` and never redirect a token. CLI `0.20.0` and older used that path and accepted whatever token the callback carried without checking the caller, so only the client can close that gap. Upgrade the CLI with `npx verdaccio-openid@latest`; a new CLI works against any server since `0.14.0`, so the CLI and the server do not have to be upgraded together. This is a breaking change for the old CLI, which is why the release is `0.21.0` rather than a patch.
- Honor `http_proxy`, `https_proxy` and `no_proxy` for outbound requests. The server reads them from the Verdaccio config; the CLI login reads them from its own environment. Drop `@gitbeaker/rest`: GitLab groups are read page by page over that transport instead.
- Match GitLab groups by their full path rather than their name. With `provider-type: gitlab`, the groups of a user were read from the group _name_. A name is not unique and not reserved: anyone who is allowed to create a group could create one named like a group they are not a member of and match `authorized-groups` with it. Groups now come from the full path, which GitLab keeps unique (`team/backend`, or `backend` for a top-level group). This needs an update where configured group names are not full paths. Top-level groups are unaffected, because their name and path usually agree. A group configured as `backend` that lives inside `team` has to become `team/backend` in `authorized-groups` and `group-users`, both in the `auth` and the `middlewares` sections.

### Patch Changes

- Stop naming the client script after the plugin version: the build emits one content-hashed file and records it in a manifest that is never served, and the page loads that file instead of `verdaccio-openid-<version>.js`. The standalone status page no longer states the plugin version in its title. A published package ships only its own build's resources.
- Merge the default security settings with a small local helper instead of `deepmerge`, dropping one runtime dependency. The defaults applied and the keys the host overrides are unchanged.
- Drop `global-agent`: outbound requests already go through the per-instance proxy transport. The server and the CLI login log the proxy configuration in use, with credentials hidden, and stay silent when no proxy is configured.
- Replace the `minimist` dependency with `node:util` `parseArgs`.
- Harden the pieces around the login rather than the login itself: pages escape what they show and the back link stays on this registry; the CLI strips terminal escape sequences before it prints a server message; an unset store `ttl` is left out and an invalid one is a configuration error; the file store keeps its directory at `0700`; proxy passwords are no longer logged; the Redis store keeps user info as JSON. The new web-login path (see the `cli-web-login` changeset) works against any server since `0.14.0` with no lockstep upgrade.
- Treat only plain objects as objects when reading JSON: an array read back from the user info cache, or passed to `setUserInfo`, is now rejected instead of being used as a record.
- Minify the inline client and status page CSS and optimize the client login icon at build time.
- Group the store interface into domain slices (`OpenIDStateStore`, `ProviderCache`, `WebAuthnStore`, `LoginResultStore`) so each flow depends only on the slice it uses. The login result is now a typed object instead of a JSON string: backends serialize it and reject corrupted rows as a miss, and a WebAuthn session is a `pending`/`ready` value so a pending login can never be consumed. Misses read as `undefined` everywhere, and the optional cache methods are required. Storage layout is unchanged except for Redis user info rows: they used to be hashes (which stringified arrays and nested objects) and are now JSON strings. A row written by the old version reads as a miss once and is then replaced; do not mix versions against the same Redis database during the rollout.
- Use `body-parser` for JSON request bodies instead of depending on Express at runtime.

## 0.20.0

_Released 2026-11-24_

### Minor Changes

- Harden how npm tokens are handled. A token is no longer accepted where a password belongs: a legacy `npm login` that sends a token as its password is rejected. Verdaccio answers such a login with a new token, so a token could renew itself indefinitely without asking the provider. Breaking changes: AES legacy tokens issued by older versions are rejected, and those users have to log in again. JWT npm tokens remain valid until they expire, but a legacy `npm login` no longer accepts one as its password; this covers `npm login --auth-type=legacy` and any other client that sends `_auth: base64(user:token)`, which have to send `_authToken` instead.

## 0.19.1

_Released 2026-11-16_

### Patch Changes

- Update the empty-registry guide in "Configuration → Publishing" too. Only the copy on the empty home page was patched when password login was replaced, so the Publishing tab kept showing `npm adduser`. The login hint also no longer carries an extra top margin when the command it sits under is hidden.
- Harden the client against bad input from the login redirect, and fix the messages the review turned up. A link that carries no valid tokens no longer stores them, and the token command quotes the token instead of interpolating it. A malformed query string no longer stops the login button from being taken over. The state error now also mentions expiry, and the CLI usage hint says "a public npm registry or mirror".
- Tidy the usage info injected into Configuration → Package Managers and the empty-registry guide. `npm adduser` and `npm profile set password` are now removed whenever they cannot work with the current session: always after an OpenID Connect login, and for anonymous users when `keep-passwd-login` is disabled. Where the password commands stay visible, the invitation is framed as an alternative to them; where they are gone, it is a plain hint. The same applies to the "No Package Published Yet" guide: its `npm adduser` command and the yarn alternative below it are hidden once password login is gone, and the token command is shown after a login. The injected text and the `or` between the two login buttons now follow the language Verdaccio is set to, and ship English, Czech, German, Spanish, French, Irish, Galician, Italian, Korean, Polish, Portuguese, Russian, Turkish, Simplified Chinese and Traditional Chinese.
- Restyle the OpenID Connect login button shown in the password login dialog (when `keepPasswdLogin` is enabled). The button is now full width, outlined, with a lock icon and an "or" divider above it, and it has hover and keyboard-focus styles. It uses inherited text colors and neutral gray borders and backgrounds.
- Reword the messages the plugin shows on its own pages and in the CLI. The login outcome pages now lead with "Login failed", "Success", and "Access denied" instead of emoticons, and the logo on those pages is marked as decorative so screen readers skip it. The CLI usage hint reads plainly, the configuration and token error messages are clearer, and a failed CLI login is reported as an error rather than a warning.

## 0.19.0 (2026-09-15)

### Minor Changes

- Add a MongoDB-backed store via `store-type: mongodb` so OIDC state, user info, groups, and WebAuthn tokens can be shared across replicas with an existing MongoDB deployment. The project’s minimum supported Node.js version is now `>=20.19.0`.

### Patch Changes

- Escape injected login option values before they are rendered into the login button configuration. This prevents malformed HTML or unsafe values from being passed through when custom login text or related options are used.
- Guard missing DynamoDB configuration during store setup and separate read-consistency handling for state and cache reads. This avoids crashes when the DynamoDB backend is configured incompletely and makes the store behavior more predictable for retryable reads.

## 0.18.0

### ✨ Features

- **DynamoDB store backend** — new `dynamodb` store type for cloud-native multi-replica deployments. OIDC state, user info, groups, and WebAuthn tokens are persisted in a shared DynamoDB table. Configurable via `store-type: dynamodb` with `tableName`, `region`, and optional `partitionKey`. (#20) Thanks to @ederelias for contributing this feature!
- **CLI port fallback** — CLI now tries port `8239` first, then falls back to `18239` if busy, instead of failing immediately. (#22)
- **OIDC state round-trip** — CLI auth flow improved with server-side OIDC state tracking for better reliability. (#22)

### ⚠️ Breaking Changes

- **Peer dependencies** — `ioredis` and `node-persist` are no longer automatically installed. If you use `store-type: redis` or `store-type: file`, you must install the corresponding package(s) alongside the plugin:

  ```bash
  # Redis
  npm install ioredis

  # File
  npm install node-persist
  ```

  `in-memory` store (default) requires no additional packages.

### ♻️ Refactors

- **Build tooling** — migrated from Rollup to [tsdown](https://github.com/egoist/tsdown).
- **Lint & format** — migrated from ESLint/Prettier to [oxlint](https://oxc.rs/docs/guide/usage/linter.html)/[oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), added [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) pre-commit hooks.
- **DynamoDB SDK** — lazy-loaded with clear error messages when packages are missing.
- **Status page** — redesigned with dual-theme support, SVG icons, and card layout. (#23)
- **Logger** — export updated to maintain live binding for better compatibility.
- **Client constants** — moved client-only constants into `init.ts` for cleaner module boundaries.

### 🐛 Fixes

- **DynamoDB errors** — raw AWS SDK errors are now caught, classified (transient vs permanent), and wrapped before reaching the plugin layer.
- **Store creation** — error handling added for store initialization failures.
- **Status page** — HTML escaping removed from `buildSuccessPage` output.
- **Code format** — minor formatting fix.

### 📝 Documentation

- **Restructured** — README.md rewritten for conciseness; detailed content split into `docs/` by topic:
  - `configuration.md` — all config options, provider discovery, `keep-passwd-login`
  - `store-config.md` — Redis, File, DynamoDB backends with peer dependency instructions
  - `environment-variables.md` — env var mapping, dotenv support
  - `cli-auth.md` — CLI login flow
  - `development.md` — build, test, project structure
- **i18n** — full Chinese translations added (`README.zh-CN.md`, `docs/zh-CN/`).

### 🔧 Chores

- Update dependencies
- Update Node.js versions in CI matrix
- Comprehensive tests added for previously untested modules
