/* eslint-disable @typescript-eslint/ban-ts-comment */
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
