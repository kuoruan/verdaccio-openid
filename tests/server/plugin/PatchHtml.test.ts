import type { Request } from "express";

import { plugin } from "@/constants";
import {
  staticPath,
  VERDACCIO_BASENAME_UI_OPTIONS_MARKER,
  VERDACCIO_UI_OPTIONS_SCRIPT_MARKER,
} from "@/server/constants";
import { PatchHtml } from "@/server/plugin/PatchHtml";

vi.mock("@/server/plugin/utils", () => ({
  getBaseUrl: vi.fn(() => "https://registry.example"),
}));

describe("PatchHtml", () => {
  const request = {} as Request;
  const config = {
    urlPrefix: "/verdaccio",
    keepPasswdLogin: true,
    loginButtonText: "Sign in with OIDC",
  } as any;

  function createPatchHtml() {
    return new PatchHtml(config);
  }

  const HTML = `
<html>
  <head>
    <script>window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}</script>
  </head>
  <body>
  </body>
</html>`;

  /** The options object as it appears in the injected inline script. */
  function injectedOptions(loginButtonText: string): string {
    const patcher = new PatchHtml({ ...config, loginButtonText } as any);
    // @ts-expect-error insertTags is private
    const result: string = patcher.insertTags(HTML, request);
    const match = result.match(/__VERDACCIO_OPENID_OPTIONS=(\{.*?\})\s*<\/script>/);
    expect(match, `no options object found in:\n${result}`).not.toBeNull();
    return match![1];
  }

  it("does not let a loginButtonText terminate the inline script block", () => {
    const options = injectedOptions(`</script><script>window.__pwned=1</script>`);

    // The text survives as inert data; what must not survive is a real
    // closing tag that ends the script and starts a new one.
    expect(options).not.toContain("</script>");
    expect(options).toContain(String.raw`\u003C/script>`);
    expect(JSON.parse(options).loginButtonText).toBe(`</script><script>window.__pwned=1</script>`);
  });

  it("emits parseable JSON for a loginButtonText containing quotes", () => {
    const options = injectedOptions('Sign "in" now');

    expect(() => JSON.parse(options)).not.toThrow();
    expect(JSON.parse(options).loginButtonText).toBe('Sign "in" now');
  });

  it("should inject script tags for Verdaccio <= 6.4 HTML", () => {
    const html = `
<html>
  <head>
    <script>window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}</script>
  </head>
  <body>
  </body>
</html>`;

    // @ts-expect-error
    const result = createPatchHtml().insertTags(html, request);

    expect(result).toContain(`window.${VERDACCIO_BASENAME_UI_OPTIONS_MARKER}={}`);
    expect(result).toContain(
      `window.__VERDACCIO_OPENID_OPTIONS={"keepPasswdLogin":true,"loginButtonText":"Sign in with OIDC"}`,
    );
    expect(result).toContain(
      `<script defer="defer" src="https://registry.example${staticPath}/${plugin.name}-${plugin.version}.js"></script>`,
    );
  });

  it("should inject script tags for Verdaccio >= 6.5 HTML", () => {
    const html = `
<html>
  <head>
    <script defer="defer" src="/-/static/runtime/ui-options.js"></script>
  </head>
  <body>
  </body>
</html>`;

    // @ts-expect-error
    const result = createPatchHtml().insertTags(html, request);

    expect(result).toContain(VERDACCIO_UI_OPTIONS_SCRIPT_MARKER);
    expect(result).toContain(`src="https://registry.example${staticPath}/${plugin.name}-${plugin.version}.js"`);
  });

  it("should return the original value when content does not look like Verdaccio HTML", () => {
    const content = "plain text response";

    // @ts-expect-error
    const result = createPatchHtml().insertTags(content, request);

    expect(result).toBe(content);
  });

  it("should support Buffer HTML input", () => {
    const html = Buffer.from(`
<body>
  <script src="${VERDACCIO_UI_OPTIONS_SCRIPT_MARKER}"></script>
</body>`);

    // @ts-expect-error
    const result = createPatchHtml().insertTags(html, request);

    expect(typeof result).toBe("string");
    expect(result).toContain(
      `window.__VERDACCIO_OPENID_OPTIONS={"keepPasswdLogin":true,"loginButtonText":"Sign in with OIDC"}`,
    );
  });
});
