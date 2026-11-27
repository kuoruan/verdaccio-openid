import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

const webLogin = vi.fn();
const saveNpmToken = vi.fn();
const respondWithCliSuccess = vi.fn();
const validateRegistry = vi.fn();

vi.mock("@/cli/web-login", () => ({ webLogin: (...args: unknown[]) => webLogin(...args) }));
vi.mock("@/cli/npm", () => ({ saveNpmToken: (...args: unknown[]) => saveNpmToken(...args) }));
vi.mock("@/cli/response", () => ({
  respondWithCliSuccess: () => respondWithCliSuccess(),
  cliErrorMessage: (error: unknown) => String(error),
}));
vi.mock("@/cli/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logPluginInfo: vi.fn(),
}));
vi.mock("@/cli/usage", () => ({ validateRegistry: (value: unknown) => validateRegistry(value) }));

const originalArgv = process.argv;

/**
 * Import the CLI entry with the given arguments and wait for the login call it
 * makes, so the assertions see a completed run instead of a pending import.
 *
 * @param argv the arguments after the script name
 */
async function runCli(argv: string[]): Promise<void> {
  vi.resetModules();
  vi.clearAllMocks();
  webLogin.mockResolvedValue("npm-token");
  validateRegistry.mockReturnValue("http://registry.test");
  process.argv = ["node", "verdaccio-openid", ...argv];

  await import("@/cli/index");
  await vi.waitFor(() => expect(respondWithCliSuccess).toHaveBeenCalled());
}

describe("cli entry", () => {
  afterEach(() => {
    process.argv = originalArgv;
  });

  it.each<[string, string[], unknown, { useProxy: boolean; validateUrls: boolean }]>([
    ["accepts the defaults", [], undefined, { useProxy: true, validateUrls: true }],
    ["disables the proxy for --no-proxy", ["--no-proxy"], undefined, { useProxy: false, validateUrls: true }],
    ["skips URL checks for --unsafe-urls", ["--unsafe-urls"], undefined, { useProxy: true, validateUrls: false }],
    [
      "reads --registry with a separate value",
      ["--registry", "http://a.test"],
      "http://a.test",
      { useProxy: true, validateUrls: true },
    ],
    [
      "reads --registry with an inline value",
      ["--registry=http://b.test"],
      "http://b.test",
      { useProxy: true, validateUrls: true },
    ],
    ["ignores an unknown option", ["--wat"], undefined, { useProxy: true, validateUrls: true }],
    [
      "leaves a missing --registry value to the validator",
      ["--registry"],
      true,
      { useProxy: true, validateUrls: true },
    ],
    ["does not read the old --proxy flag", ["--proxy=false"], undefined, { useProxy: true, validateUrls: true }],
  ])("%s", async (_case, argv, expectedRegistry, expectedOptions) => {
    await runCli(argv);

    expect(validateRegistry).toHaveBeenCalledWith(expectedRegistry);
    expect(webLogin).toHaveBeenCalledWith("http://registry.test", expectedOptions);
    expect(saveNpmToken).toHaveBeenCalledWith("npm-token", "http://registry.test");
  });
});
