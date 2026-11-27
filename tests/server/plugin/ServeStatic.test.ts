import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staticPath } from "@/server/constants";
import { ServeStatic } from "@/server/plugin/ServeStatic";

/** A plain GET over raw http: Node's fetch adds `cache-control: no-cache` to a conditional request, which hides the 304. */
function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const { port, pathname } = new URL(url);

  return new Promise((resolve, reject) => {
    const req = request({ port, path: pathname, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("ServeStatic", () => {
  const hashed = "verdaccio-openid.COYaLTdK.js";
  let dir: string;
  let base: string;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "openid-static-"));
    writeFileSync(join(dir, hashed), "window.__openid = 1;");

    const app = express();
    new ServeStatic(dir).register_middlewares(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${staticPath}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves a hashed script without imposing its own cache policy", async () => {
    const response = await fetch(`${base}/${hashed}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0");
    expect(await response.text()).toBe("window.__openid = 1;");
  });

  it("answers a conditional request with 304 and no body", async () => {
    const etag = (await fetch(`${base}/${hashed}`)).headers.get("etag");

    expect(etag).toBeTruthy();

    const revalidated = await get(`${base}/${hashed}`, { "If-None-Match": etag! });

    expect(revalidated.status).toBe(304);
    expect(revalidated.body).toBe("");
  });

  it("does not set a cache policy of its own for a missing script", async () => {
    const response = await fetch(`${base}/missing.abc123.js`);

    expect(response.status).toBe(404);
  });
});
