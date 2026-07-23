# CLI Authentication

## Quick Start

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

If you've already configured the registry via `npm config set registry`, you can omit `--registry`.

This opens a browser window for OIDC login. On success, the npm token is saved to your `.npmrc` automatically.

## How It Works

1. The CLI starts a local callback server on port `8239` (falls back to `18239` if busy).
2. It opens your browser to the registry's OIDC authorize URL.
3. After you authenticate with the provider, the registry redirects the token back to the local server.
4. The CLI saves the token to your `.npmrc` and exits.

## When to Use CLI

Use the CLI authentication when Web Authn is unavailable — for example, with npm versions older than v8.14.0, or when a browser-based flow isn't feasible in your environment.
