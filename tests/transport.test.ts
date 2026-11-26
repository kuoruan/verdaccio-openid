import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransport } from "@/transport";
import { resolveProxyConfig } from "@/utils";

const constructorArgs: unknown[][] = [];

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    EnvHttpProxyAgent: class extends actual.EnvHttpProxyAgent {
      constructor(...args: any[]) {
        constructorArgs.push(args);
        super(...args);
      }
    },
  };
});

const ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"] as const;

function clearProxyEnv(): void {
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  constructorArgs.length = 0;
});

describe("createTransport", () => {
  it("connects directly when nothing is configured", async () => {
    clearProxyEnv();

    const transport = createTransport();

    expect(typeof transport.fetch).toBe("function");
    await transport.close();
  });

  it("bypasses environment proxies only for direct transport", async () => {
    let proxyHits = 0;
    const target = createServer((_req, res) => res.end("direct"));
    const proxy = createServer();
    proxy.on("connect", (_req, socket) => {
      proxyHits++;
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    await Promise.all([
      new Promise<void>((r) => target.listen(0, "127.0.0.1", r)),
      new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r)),
    ]);
    const targetPort = (target.address() as { port: number }).port;
    const proxyPort = (proxy.address() as { port: number }).port;
    clearProxyEnv();
    vi.stubEnv("http_proxy", `http://127.0.0.1:${proxyPort}`);
    const proxied = createTransport(resolveProxyConfig());
    const direct = createTransport(false);
    try {
      await expect(proxied.fetch(`http://127.0.0.1:${targetPort}`)).rejects.toThrow();
      expect(proxyHits).toBe(1);
      expect(await (await direct.fetch(`http://127.0.0.1:${targetPort}`)).text()).toBe("direct");
      expect(proxyHits).toBe(1);
    } finally {
      await Promise.all([proxied.close(), direct.close()]);
      await Promise.all([
        new Promise<void>((r) => target.close(() => r())),
        new Promise<void>((r) => proxy.close(() => r())),
      ]);
    }
  });

  it("forwards the resolved values to the agent", () => {
    clearProxyEnv();
    vi.stubEnv("https_proxy", "http://from-env:8080");

    createTransport(resolveProxyConfig({ https_proxy: "http://from-config:8080" }));

    expect(constructorArgs.at(-1)?.[0]).toMatchObject({ httpsProxy: "http://from-config:8080" });
  });

  it("fails on an invalid proxy URL instead of connecting directly", () => {
    clearProxyEnv();

    expect(() => createTransport({ https_proxy: ":::" })).toThrow();
  });
});
