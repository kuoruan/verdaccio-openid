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
});
