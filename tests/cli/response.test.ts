/* eslint-disable @typescript-eslint/unbound-method */

import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogger = {
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("@/cli/logger", () => ({
  default: mockLogger,
}));

vi.mock("@/cli/npm", () => ({
  getNpmConfigFile: vi.fn(() => "/home/user/.npmrc"),
}));

vi.mock("@/status-page", () => ({
  buildSuccessPage: vi.fn((msg: string) => `<html>success:${msg}</html>`),
  buildErrorPage: vi.fn((msg: string) => `<html>error:${msg}</html>`),
  buildAccessDeniedPage: vi.fn(() => "<html>denied</html>"),
}));

vi.mock("@/constants", () => ({
  messageGroupRequired: "You are not a member of the required access group.",
  messageLoggedAndCloseWindow: "You have logged in successfully and may close this window.",
}));

describe("respondWithCliMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should log success message for status 'success'", async () => {
    const { respondWithCliMessage } = await import("@/cli/response");
    respondWithCliMessage("success", "");

    expect(mockLogger.success).toHaveBeenCalledWith("All done! We've updated your npm configuration.");
    expect(mockLogger.info).toHaveBeenCalledWith("Path:", expect.any(String));
  });

  it("should log error for status 'denied'", async () => {
    const { respondWithCliMessage } = await import("@/cli/response");
    respondWithCliMessage("denied", "");

    expect(mockLogger.error).toHaveBeenCalledWith("You are not a member of the required access group.");
  });

  it("should log warning for unknown status", async () => {
    const { respondWithCliMessage } = await import("@/cli/response");
    respondWithCliMessage("error", "Something went wrong");

    expect(mockLogger.warn).toHaveBeenCalledWith("Something went wrong");
  });
});

describe("respondWithWebPage", () => {
  let mockResponse: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockResponse = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as Response;
  });

  it("should set Content-Type header to text/html", async () => {
    const { respondWithWebPage } = await import("@/cli/response");
    respondWithWebPage("success", "", mockResponse);

    expect(mockResponse.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
  });

  it("should return 200 with success page for status 'success'", async () => {
    const { respondWithWebPage } = await import("@/cli/response");
    respondWithWebPage("success", "", mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith(expect.stringContaining("success"));
  });

  it("should return 401 with access denied page for status 'denied'", async () => {
    const { respondWithWebPage } = await import("@/cli/response");
    respondWithWebPage("denied", "", mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.send).toHaveBeenCalledWith("<html>denied</html>");
  });

  it("should return 500 with error page for unknown status", async () => {
    const { respondWithWebPage } = await import("@/cli/response");
    respondWithWebPage("error", "Something broke", mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.send).toHaveBeenCalledWith(expect.stringContaining("error"));
  });

  it("should pass error message to error page", async () => {
    const { buildErrorPage } = await import("@/status-page");
    const { respondWithWebPage } = await import("@/cli/response");

    respondWithWebPage("error", "Custom error", mockResponse);

    expect(buildErrorPage).toHaveBeenCalledWith("Custom error");
  });
});
