import { beforeEach, describe, expect, it, vi } from "vitest";

import { cliErrorMessage, respondWithCliSuccess } from "@/cli/response";
import mockLogger from "@/cli/logger";

vi.mock("@/cli/logger", () => ({
  default: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/cli/npm", () => ({
  getNpmConfigFile: vi.fn(() => "/home/user/.npmrc"),
}));

vi.mock("@/cli/constants", () => ({
  messageNpmConfigUpdated: "Updated your npm configuration.",
}));

describe("respondWithCliSuccess", () => {
  const logger = vi.mocked(mockLogger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the updated npm configuration and its path", () => {
    respondWithCliSuccess();

    expect(logger.success).toHaveBeenCalledWith("Updated your npm configuration.");
    expect(logger.info).toHaveBeenCalledWith("Path:", expect.any(String));
  });
});

describe("cliErrorMessage", () => {
  it("reports the message of a thrown error", () => {
    expect(cliErrorMessage(new Error("Something went wrong"))).toBe("Something went wrong");
  });

  it("reports a thrown string as-is", () => {
    expect(cliErrorMessage("plain failure")).toBe("plain failure");
  });

  it("strips escape sequences before the message reaches the terminal", () => {
    expect(cliErrorMessage(new Error("\u001B[2J\u001B]0;pwned\u0007bad \u009B31mtext"))).toBe("bad text");
  });

  it("flattens line breaks so a remote message cannot overwrite earlier output", () => {
    expect(cliErrorMessage(new Error("Unexpected token < in JSON at position 0\r\nOVERWRITTEN\nnext"))).toBe(
      "Unexpected token < in JSON at position 0 OVERWRITTEN next",
    );
  });
});
