/**
 * Tests for the client-side credentials module.
 *
 * This module uses localStorage — we mock it via vi.stubGlobal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock parseJwt from the lib module since it's imported by credentials
vi.mock("@/client/plugin/lib", () => ({
  parseJwt: vi.fn(),
}));

describe("credentials", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};

    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
    });
  });

  describe("saveCredentials", () => {
    it("should save username, uiToken and npmToken to localStorage", async () => {
      const { saveCredentials } = await import("@/client/plugin/credentials");

      saveCredentials({
        username: "testuser",
        uiToken: "ui-token-123",
        npmToken: "npm-token-456",
      });

      expect(store.username).toBe("testuser");
      expect(store.token).toBe("ui-token-123");
      expect(store.npm).toBe("npm-token-456");
    });
  });

  describe("clearCredentials", () => {
    it("should remove all stored credentials", async () => {
      const { saveCredentials, clearCredentials } = await import("@/client/plugin/credentials");

      saveCredentials({ username: "testuser", uiToken: "t1", npmToken: "t2" });
      expect(store.username).toBe("testuser");

      clearCredentials();

      expect(store.username).toBeUndefined();
      expect(store.token).toBeUndefined();
      expect(store.npm).toBeUndefined();
    });
  });

  describe("isLoggedIn", () => {
    it("should return false when no credentials are stored", async () => {
      const { isLoggedIn } = await import("@/client/plugin/credentials");
      expect(isLoggedIn()).toBe(false);
    });

    it("should return false when only username is stored", async () => {
      const { isLoggedIn } = await import("@/client/plugin/credentials");
      store.username = "testuser";
      expect(isLoggedIn()).toBe(false);
    });

    it("should return false when only uiToken is stored", async () => {
      const { isLoggedIn } = await import("@/client/plugin/credentials");
      store.token = "ui-token";
      expect(isLoggedIn()).toBe(false);
    });

    it("should return true when both username and uiToken are stored", async () => {
      const { isLoggedIn } = await import("@/client/plugin/credentials");
      store.username = "testuser";
      store.token = "ui-token";
      expect(isLoggedIn()).toBe(true);
    });
  });

  describe("isOpenIDLoggedIn", () => {
    it("should return false when no credentials are stored", async () => {
      const { isOpenIDLoggedIn } = await import("@/client/plugin/credentials");
      expect(isOpenIDLoggedIn()).toBe(false);
    });

    it("should return false when only partial credentials are stored", async () => {
      const { isOpenIDLoggedIn } = await import("@/client/plugin/credentials");
      store.username = "testuser";
      store.token = "ui-token";
      expect(isOpenIDLoggedIn()).toBe(false);
    });

    it("should return true when all credentials are stored", async () => {
      const { isOpenIDLoggedIn } = await import("@/client/plugin/credentials");
      store.username = "testuser";
      store.token = "ui-token";
      store.npm = "npm-token";
      expect(isOpenIDLoggedIn()).toBe(true);
    });
  });

  describe("getNPMToken", () => {
    it("should return null when no npm token is stored", async () => {
      const { getNPMToken } = await import("@/client/plugin/credentials");
      expect(getNPMToken()).toBeNull();
    });

    it("should return the npm token when stored", async () => {
      const { getNPMToken } = await import("@/client/plugin/credentials");
      store.npm = "npm-token-789";
      expect(getNPMToken()).toBe("npm-token-789");
    });
  });

  describe("isUITokenExpired", () => {
    it("should return true when no ui token is stored", async () => {
      const { isUITokenExpired } = await import("@/client/plugin/credentials");
      expect(isUITokenExpired()).toBe(true);
    });

    it("should return true when parseJwt returns null", async () => {
      const { parseJwt } = await import("@/client/plugin/lib");
      vi.mocked(parseJwt).mockReturnValue(null);

      store.token = "invalid-token";
      const { isUITokenExpired } = await import("@/client/plugin/credentials");
      expect(isUITokenExpired()).toBe(true);
    });

    it("should return true when token is expired", async () => {
      const { parseJwt } = await import("@/client/plugin/lib");
      // exp in seconds, set to 30 seconds ago
      vi.mocked(parseJwt).mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 30 });

      store.token = "expired-token";
      const { isUITokenExpired } = await import("@/client/plugin/credentials");
      expect(isUITokenExpired()).toBe(true);
    });

    it("should return true when token expires within 30 seconds", async () => {
      const { parseJwt } = await import("@/client/plugin/lib");
      // exp in seconds, set to 20 seconds from now (within 30s buffer)
      vi.mocked(parseJwt).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 20 });

      store.token = "expiring-soon-token";
      const { isUITokenExpired } = await import("@/client/plugin/credentials");
      expect(isUITokenExpired()).toBe(true);
    });

    it("should return false when token is not expired", async () => {
      const { parseJwt } = await import("@/client/plugin/lib");
      // exp in seconds, set to 1 hour from now
      vi.mocked(parseJwt).mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      store.token = "valid-token";
      const { isUITokenExpired } = await import("@/client/plugin/credentials");
      expect(isUITokenExpired()).toBe(false);
    });
  });

  describe("isValidCredentials", () => {
    it("should return true for valid credentials", async () => {
      const { isValidCredentials } = await import("@/client/plugin/credentials");
      expect(isValidCredentials({ username: "test", uiToken: "ui", npmToken: "npm" })).toBe(true);
    });

    it("should return false when username is missing", async () => {
      const { isValidCredentials } = await import("@/client/plugin/credentials");
      expect(isValidCredentials({ uiToken: "ui", npmToken: "npm" })).toBe(false);
    });

    it("should return false when uiToken is missing", async () => {
      const { isValidCredentials } = await import("@/client/plugin/credentials");
      expect(isValidCredentials({ username: "test", npmToken: "npm" })).toBe(false);
    });

    it("should return false when npmToken is missing", async () => {
      const { isValidCredentials } = await import("@/client/plugin/credentials");
      expect(isValidCredentials({ username: "test", uiToken: "ui" })).toBe(false);
    });

    it("should return false for empty object", async () => {
      const { isValidCredentials } = await import("@/client/plugin/credentials");
      expect(isValidCredentials({})).toBe(false);
    });

    it("should return false when all fields are empty strings", async () => {
      const { isValidCredentials } = await import("@/client/plugin/credentials");
      expect(isValidCredentials({ username: "", uiToken: "", npmToken: "" })).toBe(false);
    });
  });
});
