import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

describe("cli npm utils", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.mocked(execFileSync).mockImplementation((command, args) => {
      if (command === "npm" && args?.join(" ") === "config list --json") {
        return JSON.stringify({
          registry: "https://registry.example.com/",
          userconfig: "/tmp/.npmrc",
        });
      }

      return "";
    });
  });

  it("should save npm token with argument-based execution", async () => {
    const { saveNpmToken } = await import("@/cli/npm");

    const token = 'bad";echo injected;"';
    saveNpmToken(token, "https://registry.example.com");
    expect(execFileSync).toHaveBeenCalledWith("npm", ["config", "set", "//registry.example.com/:_authToken", token], {
      encoding: "utf8",
    });
  });

  it("reads the registry from npm config", async () => {
    const { getNpmRegistry } = await import("@/cli/npm");
    expect(getNpmRegistry()).toBe("https://registry.example.com");
  });

  it("prefers --registry over the npm config", async () => {
    const { validateRegistry } = await import("@/cli/usage");
    expect(validateRegistry("https://cli.example.com/")).toBe("https://cli.example.com");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("falls back to the public registry when npm config has none", async () => {
    vi.mocked(execFileSync).mockImplementation(() => JSON.stringify({}));
    const { getNpmRegistry } = await import("@/cli/npm");
    expect(getNpmRegistry()).toBe("https://registry.npmjs.org");
  });

  it("rejects the public fallback when npm config has no registry", async () => {
    vi.mocked(execFileSync).mockImplementation(() => JSON.stringify({}));
    const { validateRegistry } = await import("@/cli/usage");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    try {
      expect(() => validateRegistry()).toThrow("exit");
    } finally {
      exit.mockRestore();
    }
  });

  it("falls back to the public registry for whitespace-only npm configuration", async () => {
    vi.mocked(execFileSync).mockImplementation(() => JSON.stringify({ registry: "   " }));
    const { getNpmRegistry } = await import("@/cli/npm");
    expect(getNpmRegistry()).toBe("https://registry.npmjs.org");
  });

  it("matches public registries by hostname", async () => {
    const { validateRegistry } = await import("@/cli/usage");
    expect(validateRegistry("https://private.example/registry.npmjs.org")).toBe(
      "https://private.example/registry.npmjs.org",
    );
    expect(validateRegistry("https://registry.npmjs.org.example.com")).toBe("https://registry.npmjs.org.example.com");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    try {
      expect(() => validateRegistry("https://REGISTRY.NPMJS.ORG:443")).toThrow("exit");
      expect(() => validateRegistry("https://registry.yarnpkg.com")).toThrow("exit");
      expect(() => validateRegistry("https://npm.pkg.github.com")).toThrow("exit");
    } finally {
      exit.mockRestore();
    }
  });

  it("rejects invalid and non-HTTP registry URLs", async () => {
    const { validateRegistry } = await import("@/cli/usage");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    try {
      expect(() => validateRegistry("not a URL")).toThrow("exit");
      expect(() => validateRegistry("localhost:4873")).toThrow("exit");
    } finally {
      exit.mockRestore();
    }
  });

  it("rejects a --registry that is not a URL string", async () => {
    const { validateRegistry } = await import("@/cli/usage");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    try {
      expect(() => validateRegistry(12345)).toThrow("exit");
    } finally {
      exit.mockRestore();
    }
  });

  it("never lets the token surface when npm refuses to write it", async () => {
    vi.mocked(execFileSync).mockImplementation((command, args) => {
      if (args?.join(" ") === "config list --json") {
        return JSON.stringify({ registry: "https://registry.example.com/", userconfig: "/tmp/.npmrc" });
      }

      // Node's own message embeds the full argv, token included.
      throw new Error(`Command failed: npm ${args?.join(" ")}\nEACCES: permission denied`);
    });

    const { saveNpmToken } = await import("@/cli/npm");

    expect(() => saveNpmToken("SECRET_TOKEN", "https://registry.example.com")).toThrow(
      /^command failed: npm config set \/\/registry\.example\.com\/:_authToken "<token>"$/,
    );
  });
});
