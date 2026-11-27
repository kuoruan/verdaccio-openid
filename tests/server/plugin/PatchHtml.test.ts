import type { AddressInfo } from "node:net";

import express from "express";
import { describe, expect, it, vi } from "vitest";

import {
  staticPath,
  VERDACCIO_BASENAME_UI_OPTIONS_MARKER,
  VERDACCIO_UI_OPTIONS_SCRIPT_MARKER,
} from "@/server/constants";
import { PatchHtml } from "@/server/plugin/PatchHtml";

vi.mock("@/server/plugin/utils", () => ({
  getBaseUrl: vi.fn(() => "https://registry.example"),
}));

const defaultConfig = {
  urlPrefix: "/verdaccio",
  keepPasswdLogin: true,
  loginButtonText: "Sign in with OIDC",
} as any;

/** The entry script the manifest would name; the real loader has its own suite. */
const defaultEntry = "verdaccio-openid.COYaLTdK.js";

interface Served {
  cacheControl: string | null;
  text: string;
}

async function serve(body: unknown, opts?: { cacheControl?: string; config?: any; entry?: string }): Promise<Served> {
  const app = express();
  new PatchHtml(opts?.config ?? defaultConfig, opts?.entry ?? defaultEntry).register_middlewares(app);
  app.get("/page", (_req, res) => {
    if (opts?.cacheControl !== undefined) res.setHeader("Cache-Control", opts.cacheControl);
    res.send(body as any);
  });
  const listener = app.listen(0);
  const port = (listener.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/page`);
    return { cacheControl: res.headers.get("cache-control"), text: await res.text() };
  } finally {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}

describe("PatchHtml", () => {
  const config = defaultConfig;

  const entryScript = defaultEntry;
  const scriptSrc = `https://registry.example${staticPath}/${entryScript}`;

  const HTML = `
<html>
  <head>
    <script>window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}</script>
  </head>
  <body>
  </body>
</html>`;

  /** The options object as it appears in the injected inline script. */
  async function injectedOptions(loginButtonText: string): Promise<string> {
    const { text } = await serve(HTML, { config: { ...config, loginButtonText } });
    const match = text.match(/__VERDACCIO_OPENID_OPTIONS=(\{.*?\})\s*<\/script>/);
    expect(match, `no options object found in:\n${text}`).not.toBeNull();
    return match![1];
  }

  it("does not let a loginButtonText terminate the inline script block", async () => {
    const options = await injectedOptions(`</script><script>window.__pwned=1</script>`);

    // The text survives as inert data; what must not survive is a real
    // closing tag that ends the script and starts a new one.
    expect(options).not.toContain("</script>");
    expect(options).toContain(String.raw`\u003C/script>`);
    expect(JSON.parse(options).loginButtonText).toBe(`</script><script>window.__pwned=1</script>`);
  });

  it("emits parseable JSON for a loginButtonText containing quotes", async () => {
    const options = await injectedOptions('Sign "in" now');

    expect(() => JSON.parse(options)).not.toThrow();
    expect(JSON.parse(options).loginButtonText).toBe('Sign "in" now');
  });

  it("should inject script tags for Verdaccio <= 6.4 HTML", async () => {
    const html = `
<html>
  <head>
    <script>window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}</script>
  </head>
  <body>
  </body>
</html>`;

    const { text } = await serve(html);

    expect(text).toContain(`window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}`);
    expect(text).toContain(
      `window.__VERDACCIO_OPENID_OPTIONS={"keepPasswdLogin":true,"loginButtonText":"Sign in with OIDC"}`,
    );
    expect(text).toContain(`<script defer="defer" src="${scriptSrc}"></script>`);
  });

  it("should inject script tags for Verdaccio >= 6.5 HTML", async () => {
    const html = `
<html>
  <head>
    <script defer="defer" src="/-/static/runtime/ui-options.js"></script>
  </head>
  <body>
  </body>
</html>`;

    const { text } = await serve(html);

    expect(text).toContain(VERDACCIO_UI_OPTIONS_SCRIPT_MARKER);
    expect(text).toContain(`src="${scriptSrc}"`);
  });

  it("should return the original value when content does not look like Verdaccio HTML", async () => {
    const { text, cacheControl } = await serve("plain text response");

    expect(text).toBe("plain text response");
    expect(cacheControl).toBeNull();
  });

  it("should support Buffer HTML input", async () => {
    const html = Buffer.from(`
<body>
  <script src="${VERDACCIO_UI_OPTIONS_SCRIPT_MARKER}"></script>
</body>`);

    const { text } = await serve(html);

    expect(text).toContain(
      `window.__VERDACCIO_OPENID_OPTIONS={"keepPasswdLogin":true,"loginButtonText":"Sign in with OIDC"}`,
    );
  });

  it("leaves a body with a marker but no insertion point untouched", async () => {
    const html = `<html><head><script>window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}</script></head><body></body></html>`;

    const { text, cacheControl } = await serve(html);

    expect(text).toBe(html);
    expect(cacheControl).toBeNull();
  });

  it("leaves an unrelated Buffer body untouched", async () => {
    const { text, cacheControl } = await serve(Buffer.from("plain bytes"));

    expect(text).toBe("plain bytes");
    expect(cacheControl).toBeNull();
  });

  it("calls the original send exactly once when sending throws", async () => {
    const patcher = new PatchHtml(config, entryScript);
    const calls: unknown[][] = [];
    const res = {
      getHeader: () => undefined,
      setHeader: () => {},
      send: (...args: unknown[]) => {
        calls.push(args);
        throw new Error("boom");
      },
    };

    patcher.patchResponse({} as any, res as any, () => {});
    expect(() => (res.send as (...a: unknown[]) => unknown)(HTML)).toThrow("boom");
    expect(calls).toHaveLength(1);
  });
});

describe("PatchHtml cache policy", () => {
  const page = `<html>
  <head>
    <script>window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}</script>
  </head>
  <body>
  </body>
</html>`;
  const other = `<html>
  <head>
    <title>not verdaccio</title>
  </head>
  <body>
  </body>
</html>`;

  async function cacheControlOf(cacheControl: string | undefined, body: string): Promise<string | null> {
    return (
      await serve(body, {
        cacheControl,
        config: { urlPrefix: "/", keepPasswdLogin: true, loginButtonText: "" },
        entry: "x.abc.js",
      })
    ).cacheControl;
  }

  it("leaves the host cache policy of a patched page alone", async () => {
    expect(await cacheControlOf(undefined, page)).toBeNull();
    expect(await cacheControlOf("public, max-age=600", page)).toBe("public, max-age=600");
    expect(await cacheControlOf("no-store", page)).toBe("no-store");
  });

  it("does not touch a page it did not patch", async () => {
    expect(await cacheControlOf(undefined, other)).toBeNull();
  });
});
