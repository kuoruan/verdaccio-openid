# CLI authentication

## Quick start

```bash
npx verdaccio-openid@latest --registry http://your-registry.com
```

If you already configured the registry with `npm config set registry`, you can skip the `--registry` flag.

This opens a browser window for OIDC login. When login succeeds, the npm token is saved to your `.npmrc` automatically.

## How it works

1. The CLI starts a local callback server on port `8239` and falls back to `18239` if that port is busy.
2. It opens your browser to the registry's OIDC authorize URL.
3. After authentication, the registry redirects the token back to the local callback server.
4. The CLI saves the token to `.npmrc` and exits.

## When to use the CLI

Use the CLI flow when Web Authn is unavailable, such as with npm versions older than v8.14.0 or in environments where a browser-based login is not practical.
