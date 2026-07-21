import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @verdaccio/auth
const mockAuthInstance = {
  secret: "auth-secret",
  jwtEncrypt: vi.fn(),
  aesEncrypt: vi.fn(),
};

vi.mock("@verdaccio/auth", () => ({
  buildUser: vi.fn((name: string, token: string) => `${name}:${token}`),
  isAESLegacy: vi.fn(),
  verifyJWTPayload: vi.fn(),
}));

// Mock @verdaccio/config
vi.mock("@verdaccio/config", () => ({
  createRemoteUser: vi.fn((name: string, groups: string[]) => ({ name, real_groups: groups })),
  defaultLoggedUserRoles: ["$authenticated", "$all"],
  defaultNonLoggedUserRoles: ["$anonymous", "$all"],
}));

// Mock debugger
vi.mock("@/server/debugger", () => ({
  debug: vi.fn(),
}));

// Mock constants
vi.mock("@/server/constants", () => ({
  ERRORS: {
    INVALID_TOKEN: "Invalid token format",
    TOKEN_ENCRYPTION_FAILED_NPM: "Internal server error, failed to encrypt npm token",
    TOKEN_ENCRYPTION_FAILED: "Internal server error, failed to encrypt token",
    AUTH_NOT_INITIALIZED: "Unexpected error, auth is not initialized",
  },
}));

// Import the real utils - we only mock specific functions when needed
vi.mock("@/server/plugin/utils", async () => {
  const actual = await vi.importActual<typeof import("@/server/plugin/utils")>("@/server/plugin/utils");
  return {
    ...actual,
  };
});

import type { ConfigHolder } from "@/server/config/Config";
import type { AuthProvider, OpenIDToken } from "@/server/plugin/AuthProvider";

// We need to import AuthCore after mocks are set up
let AuthCore: typeof import("@/server/plugin/AuthCore").AuthCore;

function createMockConfig(overrides: Partial<ConfigHolder> = {}): ConfigHolder {
  return {
    secret: "test-secret",
    security: {
      web: { sign: { algorithm: "HS256" } as any },
      api: {
        jwt: { sign: { algorithm: "HS256" } as any },
      },
    } as any,
    groupUsers: undefined,
    packages: {},
    authorizedGroups: true,
    ...overrides,
  } as ConfigHolder;
}

function createMockProvider(): AuthProvider {
  return {
    getId: () => "openid",
    getLoginUrl: vi.fn(),
    getToken: vi.fn(),
    getUserinfo: vi.fn(),
  };
}

describe("AuthCore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/server/plugin/AuthCore");
    // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
    AuthCore = mod.AuthCore;
  });

  describe("getLoggedUserGroups", () => {
    it("should return user real_groups plus default logged user roles", () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      const groups = core.getLoggedUserGroups({
        name: "testuser",
        real_groups: ["developers"],
      } as any);

      expect(groups).toEqual(["developers", "$authenticated", "$all"]);
    });
  });

  describe("getNonLoggedUserGroups", () => {
    it("should return default non-logged user roles", () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      const groups = core.getNonLoggedUserGroups();

      expect(groups).toEqual(["$anonymous", "$all"]);
    });
  });

  describe("getUserGroups", () => {
    it("should return undefined when groupUsers is not configured", () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      expect(core.getUserGroups("testuser")).toBeUndefined();
    });

    it("should return groups that contain the user", () => {
      const core = new AuthCore(
        createMockConfig({
          groupUsers: {
            admins: ["admin1", "admin2"],
            developers: ["dev1", "testuser"],
            viewers: ["viewer1"],
          },
        }),
        createMockProvider(),
      );

      expect(core.getUserGroups("testuser")).toEqual(["developers"]);
    });

    it("should return empty array when user is not in any group", () => {
      const core = new AuthCore(
        createMockConfig({
          groupUsers: {
            admins: ["admin1"],
            developers: ["dev1"],
          },
        }),
        createMockProvider(),
      );

      expect(core.getUserGroups("unknown")).toEqual([]);
    });
  });

  describe("filterRealGroups", () => {
    it("should filter groups to only configured and authenticated groups", () => {
      const core = new AuthCore(
        createMockConfig({
          packages: {
            package1: { access: ["developers"], publish: ["admins"] },
          },
          authorizedGroups: ["admins"],
        }),
        createMockProvider(),
      );

      const groups = core.filterRealGroups("testuser", ["developers", "admins", "public"]);
      // developers from packages, admins from authorizedGroups, "public" is filtered out
      // Plus username is added
      expect(groups).toContain("testuser");
      expect(groups).toContain("developers");
      expect(groups).toContain("admins");
      expect(groups).not.toContain("public");
    });

    it("should add username to the groups", () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      const groups = core.filterRealGroups("testuser", []);
      expect(groups).toContain("testuser");
    });

    it("should deduplicate groups", () => {
      const core = new AuthCore(
        createMockConfig({
          packages: {
            package1: { access: ["developers"], publish: ["developers"] },
          },
        }),
        createMockProvider(),
      );

      const groups = core.filterRealGroups("testuser", ["developers"]);
      const developerCount = groups.filter((g) => g === "developers").length;
      expect(developerCount).toBe(1);
    });
  });

  describe("authenticate", () => {
    it("should return false when username is empty", () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      expect(core.authenticate("")).toBe(false);
    });

    it("should return true when authenticatedGroups is true and user has groups", () => {
      const core = new AuthCore(createMockConfig({ authorizedGroups: true }), createMockProvider());
      expect(core.authenticate("testuser", ["developers"])).toBe(true);
    });

    it("should return false when authenticatedGroups is true and user has no groups", () => {
      const core = new AuthCore(createMockConfig({ authorizedGroups: true }), createMockProvider());
      expect(core.authenticate("testuser", [])).toBe(false);
    });

    it("should return true when authenticatedGroups is false (no group auth required)", () => {
      const core = new AuthCore(createMockConfig({ authorizedGroups: false }), createMockProvider());
      expect(core.authenticate("testuser", [])).toBe(true);
    });

    it("should return true when user is in one of the authenticatedGroups", () => {
      const core = new AuthCore(createMockConfig({ authorizedGroups: ["admins", "developers"] }), createMockProvider());
      expect(core.authenticate("testuser", ["developers"])).toBe(true);
    });

    it("should return true when username matches an authenticated group", () => {
      const core = new AuthCore(createMockConfig({ authorizedGroups: ["testuser"] }), createMockProvider());
      expect(core.authenticate("testuser", [])).toBe(true);
    });

    it("should return false when user is not in any authenticated group", () => {
      const core = new AuthCore(createMockConfig({ authorizedGroups: ["admins"] }), createMockProvider());
      expect(core.authenticate("testuser", ["developers"])).toBe(false);
    });
  });

  describe("verifyUiToken", () => {
    it("should verify JWT and return RemoteUser", async () => {
      const { verifyJWTPayload } = await import("@verdaccio/auth");
      const mockUser = { name: "testuser", real_groups: ["developers"] };
      vi.mocked(verifyJWTPayload).mockReturnValue(mockUser as any);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      const result = core.verifyUiToken("valid-jwt-token");

      expect(verifyJWTPayload).toHaveBeenCalledWith("valid-jwt-token", "test-secret", expect.any(Object));
      expect(result).toEqual(mockUser);
    });

    it("should use auth.secret when auth is set", async () => {
      const { verifyJWTPayload } = await import("@verdaccio/auth");
      vi.mocked(verifyJWTPayload).mockReturnValue({ name: "user", real_groups: [] } as any);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      core.verifyUiToken("token");

      expect(verifyJWTPayload).toHaveBeenCalledWith("token", "auth-secret", expect.any(Object));
    });
  });

  describe("issueUiToken", () => {
    it("should sign JWT with web sign options", async () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.jwtEncrypt).mockResolvedValue("signed-ui-token");

      const { createRemoteUser } = await import("@verdaccio/config");
      const token = await core.issueUiToken("testuser", ["developers"]);

      expect(token).toBe("signed-ui-token");
      expect(createRemoteUser).toHaveBeenCalledWith("testuser", ["developers"]);
      expect(mockAuthInstance.jwtEncrypt).toHaveBeenCalled();
    });

    it("should throw ReferenceError when auth is not initialized", () => {
      const core = new AuthCore(createMockConfig(), createMockProvider());
      // auth is not set — signJWT throws synchronously

      expect(() => core.issueUiToken("testuser", [])).toThrow(ReferenceError);
      expect(() => core.issueUiToken("testuser", [])).toThrow("Unexpected error, auth is not initialized");
    });
  });

  describe("signJWT (via issueNpmToken with JWT mode)", () => {
    it("should sign JWT for npm token when security is not legacy", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(false);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.jwtEncrypt).mockResolvedValue("signed-npm-token");

      const token = await core.issueNpmToken("testuser", ["developers"], "access-token");

      expect(token).toBe("signed-npm-token");
    });
  });

  describe("verifyNpmToken", () => {
    it("should verify JWT npm token", async () => {
      const { verifyJWTPayload, isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(false);
      vi.mocked(verifyJWTPayload).mockReturnValue({
        name: "testuser",
        real_groups: ["developers"],
      } as any);

      const core = new AuthCore(createMockConfig({ authorizedGroups: true }), createMockProvider());

      const result = await core.verifyNpmToken("header.payload.signature");

      expect(result).toEqual({ name: "testuser", real_groups: ["developers"] });
    });

    it("should throw TypeError for non-JWT token when not in legacy mode", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(false);

      const core = new AuthCore(createMockConfig(), createMockProvider());

      await expect(core.verifyNpmToken("not-a-jwt")).rejects.toThrow("Invalid token format");
    });
  });

  describe("legacy encryption (npm token)", () => {
    it("should use legacy encryption when security is legacy AES", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.aesEncrypt).mockReturnValue("encrypted-legacy-token" as any);

      const token = await core.issueNpmToken("testuser", ["developers"], "access-token-string");

      expect(token).toBe("encrypted-legacy-token");
      expect(mockAuthInstance.aesEncrypt).toHaveBeenCalled();
    });

    it("should throw ReferenceError when auth is not initialized for legacy encryption", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      // auth not set — legacyEncrypt throws synchronously

      expect(() => core.issueNpmToken("testuser", [], "token")).toThrow(ReferenceError);
      expect(() => core.issueNpmToken("testuser", [], "token")).toThrow("Unexpected error, auth is not initialized");
    });

    it("should throw when legacy encryption returns falsy", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.aesEncrypt).mockReturnValue("" as any);

      expect(() => core.issueNpmToken("testuser", [], "token")).toThrow(
        "Internal server error, failed to encrypt token",
      );
    });
  });

  describe("issueNpmToken with legacy providerToken (TokenInfo)", () => {
    it("should encode provider token info with expiresAt", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      vi.mocked(mockAuthInstance.aesEncrypt).mockImplementation((input: string) => input as any);

      const providerToken: OpenIDToken = {
        accessToken: "at-123",
        subject: "sub-456",
        expiresAt: 1_700_000_000,
      };

      const token = await core.issueNpmToken("testuser", ["dev"], providerToken);

      // Token format is "username:base64url(payload)"
      const parts = token.split(":");
      expect(parts[0]).toBe("testuser");

      const payload = JSON.parse(Buffer.from(parts.slice(1).join(":"), "base64url").toString("utf8"));
      expect(payload.n).toBe("testuser");
      expect(payload.g).toEqual(["dev"]);
      expect(payload.exp).toBe(1_700_000_000);
    });

    it("should encode provider token info without expiresAt as accessToken", async () => {
      const { isAESLegacy } = await import("@verdaccio/auth");
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      vi.mocked(mockAuthInstance.aesEncrypt).mockImplementation((input: string) => input as any);

      const providerToken: OpenIDToken = {
        accessToken: "at-789",
        subject: "sub-101",
      };

      const token = await core.issueNpmToken("testuser", ["dev"], providerToken);

      // Token format is "username:base64url(payload)"
      const parts = token.split(":");
      const payload = JSON.parse(Buffer.from(parts.slice(1).join(":"), "base64url").toString("utf8"));
      expect(payload.at).toBe("at-789");
    });
  });
});
