import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransport } from "@/transport";

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

  it("prefers the explicit value over the environment", () => {
    clearProxyEnv();
    vi.stubEnv("https_proxy", "http://from-env:8080");

    createTransport({ https_proxy: "http://from-config:8080" });

    expect(constructorArgs.at(-1)?.[0]).toMatchObject({ httpsProxy: "http://from-config:8080" });
  });

  it("treats a blank explicit value as unset so the environment applies", () => {
    clearProxyEnv();
    vi.stubEnv("https_proxy", "http://from-env:8080");

    createTransport({ https_proxy: "   " });

    expect(constructorArgs.at(-1)?.[0]).toMatchObject({ httpsProxy: undefined });
  });

  it("fails on an invalid proxy URL instead of connecting directly", () => {
    clearProxyEnv();

    expect(() => createTransport({ https_proxy: ":::" })).toThrow();
  });
});
