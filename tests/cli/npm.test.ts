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
    saveNpmToken(token);

    expect(execFileSync).toHaveBeenCalledWith("npm", ["config", "list", "--json"], { encoding: "utf8" });
    expect(execFileSync).toHaveBeenCalledWith("npm", ["config", "set", "//registry.example.com/:_authToken", token], {
      encoding: "utf8",
    });
  });

  /**
   * Run a body with a given process.argv and restore the original afterwards.
   *
   * @param args the CLI arguments to expose
   * @param body the assertions to run
   */
  async function withArgv(args: string[], body: () => Promise<void>): Promise<void> {
    const original = process.argv;

    process.argv = ["node", "cli", ...args];

    try {
      await body();
    } finally {
      process.argv = original;
    }
  }

  it("prefers --registry over the npm config", async () => {
    await withArgv(["--registry", "https://cli.example.com/"], async () => {
      const { getRegistryUrl } = await import("@/cli/npm");

      expect(getRegistryUrl()).toBe("https://cli.example.com");
    });
  });

  it("falls back to the public registry when neither source has one", async () => {
    vi.mocked(execFileSync).mockImplementation(() => JSON.stringify({}));

    await withArgv([], async () => {
      const { getRegistryUrl } = await import("@/cli/npm");

      expect(getRegistryUrl()).toBe("registry.npmjs.org");
    });
  });

  it("rejects a --registry that is not a URL string", async () => {
    await withArgv(["--registry", "12345"], async () => {
      const { getRegistryUrl } = await import("@/cli/npm");

      expect(() => getRegistryUrl()).toThrow(/expects a URL/);
    });
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

    expect(() => saveNpmToken("SECRET_TOKEN")).toThrow(
      /^command failed: npm config set \/\/registry\.example\.com\/:_authToken "<token>"$/,
    );
  });
});
