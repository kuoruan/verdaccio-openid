import { ERRORS } from "@/server/constants";
import { createDiscoveryCooldownError, createDiscoveryError } from "@/server/openid/DiscoveryErrorUtils";

describe("createDiscoveryError", () => {
  it("should wrap Error instance with discovery failure prefix", () => {
    const error = createDiscoveryError(new Error("Network timeout"));
    expect(error.message).toBe(`${ERRORS.CONFIGURATION_DISCOVERY_FAILED}: Network timeout`);
  });

  it("should include the original error as cause", () => {
    const original = new Error("Original error");
    const error = createDiscoveryError(original);
    expect(error.cause).toBe(original);
  });

  it("should handle non-Error values", () => {
    const error = createDiscoveryError("Something broke");
    expect(error.message).toBe(`${ERRORS.CONFIGURATION_DISCOVERY_FAILED}: Something broke`);
    expect(error.cause).toBeUndefined();
  });

  it("should handle numeric errors", () => {
    const error = createDiscoveryError(404);
    expect(error.message).toBe(`${ERRORS.CONFIGURATION_DISCOVERY_FAILED}: 404`);
  });

  it("should handle undefined/null errors", () => {
    const error = createDiscoveryError(null);
    expect(error.message).toBe(`${ERRORS.CONFIGURATION_DISCOVERY_FAILED}: null`);
  });

  it("should always return an Error instance", () => {
    const error = createDiscoveryError("string error");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("createDiscoveryCooldownError", () => {
  const originalError = new Error("Discovery failed");

  it("should include cooldown message with remaining seconds", () => {
    const error = createDiscoveryCooldownError(originalError, 5000);
    expect(error.message).toContain(ERRORS.CONFIGURATION_DISCOVERY_RETRY_LATER);
    expect(error.message).toContain("Retry after 5s");
    expect(error.message).toContain("Discovery failed");
  });

  it("should round up seconds", () => {
    const error = createDiscoveryCooldownError(originalError, 4500);
    expect(error.message).toContain("Retry after 5s");
  });

  it("should handle zero remaining time", () => {
    const error = createDiscoveryCooldownError(originalError, 0);
    expect(error.message).toContain("Retry after 0s");
  });

  it("should include the original error as cause", () => {
    const error = createDiscoveryCooldownError(originalError, 3000);
    expect(error.cause).toBe(originalError);
  });

  it("should handle large remaining times", () => {
    const error = createDiscoveryCooldownError(originalError, 120_000);
    expect(error.message).toContain("Retry after 120s");
  });
});
