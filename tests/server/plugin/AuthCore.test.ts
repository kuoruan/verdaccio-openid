import { createHmac } from "node:crypto";

import { isAESLegacy, verifyJWTPayload } from "@verdaccio/auth";
import { createRemoteUser } from "@verdaccio/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigHolder } from "@/server/config/Config";
import { base64Encode } from "@/server/crypto";
import { AuthCore } from "@/server/plugin/AuthCore";
import type { AuthProvider, OpenIDToken } from "@/server/plugin/AuthProvider";

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

/**
 * Build a core that can issue and verify legacy tokens.
 *
 * `aesEncrypt` is the identity here, so the token `issueNpmToken` returns is the signed
 * payload itself; a real registry returns the payload wrapped in its own encryption.
 */
function signableCore(
  config: Partial<ConfigHolder> = {},
  provider: AuthProvider = createMockProvider(),
): { core: AuthCore; provider: AuthProvider } {
  const core = new AuthCore(createMockConfig(config), provider);
  core.setAuth(mockAuthInstance as any);
  vi.mocked(mockAuthInstance.aesEncrypt).mockImplementation((input: string) => input);

  return { core, provider };
}

describe("AuthCore", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Unless a case says otherwise, the registry issues legacy tokens.
    vi.mocked(isAESLegacy).mockReturnValue(true);
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
      const mockUser = { name: "testuser", real_groups: ["developers"] };
      vi.mocked(verifyJWTPayload).mockReturnValue(mockUser as any);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      const result = core.verifyUiToken("valid-jwt-token");

      expect(verifyJWTPayload).toHaveBeenCalledWith("valid-jwt-token", "test-secret", expect.any(Object));
      expect(result).toEqual(mockUser);
    });

    it("should use auth.secret when auth is set", async () => {
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
      vi.mocked(isAESLegacy).mockReturnValue(false);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.jwtEncrypt).mockResolvedValue("signed-npm-token");

      const token = await core.issueNpmToken("testuser", ["developers"], "access-token");

      expect(token).toBe("signed-npm-token");
    });
  });

  describe("isLegacySecurity", () => {
    // `@verdaccio/auth` is mocked in this file, so this pins the wiring, not the derivation.
    it("should expose what isAESLegacy reports for the configured security", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);
      expect(new AuthCore(createMockConfig(), createMockProvider()).isLegacySecurity).toBe(true);

      vi.mocked(isAESLegacy).mockReturnValue(false);
      expect(new AuthCore(createMockConfig(), createMockProvider()).isLegacySecurity).toBe(false);

      expect(isAESLegacy).toHaveBeenCalledWith(createMockConfig().security);
    });
  });

  describe("verifyLegacyToken", () => {
    it("should reject a payload that is not signed by this plugin", async () => {
      // A payload that never went through the plugin.
      const forged = base64Encode(
        JSON.stringify({ n: "attacker", g: ["admins"], exp: Math.floor(Date.now() / 1000) + 3600 }),
      );

      const core = new AuthCore(createMockConfig({ authorizedGroups: false }), createMockProvider());

      await expect(core.verifyLegacyToken(forged)).rejects.toThrow("Invalid token format");
    });

    it("should reject a payload signed with another key", async () => {
      const { core } = signableCore();
      const foreign = signLegacyPayload(
        { n: "attacker", g: ["admins"], exp: Math.floor(Date.now() / 1000) + 3600 },
        "other-secret",
      );

      await expect(core.verifyLegacyToken(foreign)).rejects.toThrow("Invalid token format");
      await expect(core.verifyLegacyToken(foreign.split(".")[0])).rejects.toThrow("Invalid token format");
    });

    it("should reject a signature that belongs to another payload", async () => {
      const { core } = signableCore();
      const payload = base64Encode(
        JSON.stringify({ n: "attacker", g: ["admins"], exp: Math.floor(Date.now() / 1000) + 3600 }),
      );
      const [, otherSignature] = signLegacyPayload({ n: "attacker", g: [], exp: 9_999_999_999 }, "test-secret").split(
        ".",
      );

      await expect(core.verifyLegacyToken(`${payload}.${otherSignature}`)).rejects.toThrow("Invalid token format");
    });

    it("should reject a signed payload containing invalid JSON", async () => {
      const { core } = signableCore();
      const encoded = base64Encode("{");
      const signature = createHmac("sha256", "test-secret").update(encoded).digest("base64url");

      await expect(core.verifyLegacyToken(`${encoded}.${signature}`)).rejects.toMatchObject({
        name: "TypeError",
        message: "Invalid token format",
      });
    });

    it.each([{ name: "attacker" }, null, "attacker", 42, true, []])(
      "should reject a signed payload of another shape: %j",
      async (payload) => {
        const { core } = signableCore();
        const token = signLegacyPayload(payload, "test-secret");

        await expect(core.verifyLegacyToken(token)).rejects.toThrow("Invalid token format");
      },
    );

    it("should verify a token it issued, with the groups frozen in it", async () => {
      const { core } = signableCore({ authorizedGroups: false });

      const token = await core.issueNpmToken("testuser", ["developers"], {
        accessToken: "at-123",
        expiresAt: 9_999_999_999,
      });

      await expect(core.verifyLegacyToken(innerPassword(token))).resolves.toEqual({
        name: "testuser",
        real_groups: ["developers"],
      });
    });

    it("should return false when the frozen expiry has passed", async () => {
      const { core } = signableCore({ authorizedGroups: false });

      const token = await core.issueNpmToken("testuser", ["developers"], {
        accessToken: "at-123",
        expiresAt: 1_000,
      });

      await expect(core.verifyLegacyToken(innerPassword(token))).resolves.toBe(false);
    });

    it("should read the user from the provider when the payload carries an access token", async () => {
      const provider = createMockProvider();
      vi.mocked(provider.getUserinfo).mockResolvedValue({ name: "testuser", groups: ["dev"] });

      const { core } = signableCore({ authorizedGroups: false }, provider);

      const token = await core.issueNpmToken("testuser", ["dev"], { accessToken: "at-789" });

      await expect(core.verifyLegacyToken(innerPassword(token))).resolves.toEqual({
        name: "testuser",
        real_groups: ["testuser"],
      });
      expect(provider.getUserinfo).toHaveBeenCalledWith("at-789");
    });

    it("should return false when the provider subject no longer matches the token", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const provider = createMockProvider();
      vi.mocked(provider.getUserinfo).mockResolvedValue({
        name: "testuser",
        groups: ["dev"],
        subject: "recreated-account",
      });

      const core = new AuthCore(createMockConfig({ authorizedGroups: false }), provider);
      core.setAuth(mockAuthInstance as any);
      vi.mocked(mockAuthInstance.aesEncrypt).mockImplementation((input: string) => input);

      const token = await core.issueNpmToken("testuser", ["dev"], {
        accessToken: "at-789",
        subject: "original-account",
      });

      await expect(core.verifyLegacyToken(innerPassword(token))).resolves.toBe(false);
    });

    it("should accept the token when the provider reports no subject", async () => {
      const provider = createMockProvider();
      vi.mocked(provider.getUserinfo).mockResolvedValue({ name: "testuser", groups: ["dev"] });

      const { core } = signableCore({ authorizedGroups: false }, provider);

      const token = await core.issueNpmToken("testuser", ["dev"], {
        accessToken: "at-789",
        subject: "original-account",
      });

      await expect(core.verifyLegacyToken(innerPassword(token))).resolves.toEqual({
        name: "testuser",
        real_groups: ["testuser"],
      });
    });

    it("should return false when the user is not in an authorized group", async () => {
      const { core } = signableCore({
        authorizedGroups: ["admins"] as any,
        packages: {},
      });

      const token = await core.issueNpmToken("testuser", ["developers"], {
        accessToken: "at-123",
        expiresAt: 9_999_999_999,
      });

      await expect(core.verifyLegacyToken(innerPassword(token))).resolves.toBe(false);
    });
  });

  describe("legacy encryption (npm token)", () => {
    it("should use legacy encryption when security is legacy AES", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.aesEncrypt).mockReturnValue("encrypted-legacy-token" as any);

      const token = await core.issueNpmToken("testuser", ["developers"], "access-token-string");

      expect(token).toBe("encrypted-legacy-token");
      expect(mockAuthInstance.aesEncrypt).toHaveBeenCalled();
    });

    it("should throw ReferenceError when auth is not initialized for legacy encryption", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      // auth not set — legacyEncrypt throws synchronously

      await expect(core.issueNpmToken("testuser", [], "token")).rejects.toThrow(ReferenceError);
      await expect(core.issueNpmToken("testuser", [], "token")).rejects.toThrow(
        "Unexpected error, auth is not initialized",
      );
    });

    it("should throw when legacy encryption returns falsy", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.aesEncrypt).mockReturnValue("" as any);

      await expect(core.issueNpmToken("testuser", [], "token")).rejects.toThrow(
        "Internal server error, failed to encrypt token",
      );
    });
  });

  describe("issueNpmToken with legacy providerToken (TokenInfo)", () => {
    it("should encode provider token info with expiresAt", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.aesEncrypt).mockImplementation((input: string) => input);

      const providerToken: OpenIDToken = {
        accessToken: "at-123",
        subject: "sub-456",
        expiresAt: 1_700_000_000,
      };

      const token = await core.issueNpmToken("testuser", ["dev"], providerToken);
      const payload = signedPayload(token);

      expect(payload.n).toBe("testuser");
      expect(payload.g).toEqual(["dev"]);
      expect(payload.exp).toBe(1_700_000_000);
      expect(payload.sub).toBe("sub-456");
    });

    it("should encode provider token info without expiresAt as accessToken", async () => {
      vi.mocked(isAESLegacy).mockReturnValue(true);

      const core = new AuthCore(createMockConfig(), createMockProvider());
      core.setAuth(mockAuthInstance as any);

      vi.mocked(mockAuthInstance.aesEncrypt).mockImplementation((input: string) => input);

      const providerToken: OpenIDToken = {
        accessToken: "at-789",
        subject: "sub-101",
      };

      const token = await core.issueNpmToken("testuser", ["dev"], providerToken);
      const payload = signedPayload(token);

      expect(payload.at).toBe("at-789");
      expect(payload.sub).toBe("sub-101");
    });
  });
});

/** The password Verdaccio passes on: everything after the `username:` prefix. */
function innerPassword(token: string): string {
  return token.slice(token.indexOf(":") + 1);
}

/** Decode the payload of the signed inner token issued by `issueNpmToken`. */
function signedPayload(token: string): Record<string, unknown> {
  const parts = innerPassword(token).split(".");

  expect(parts).toHaveLength(2);

  return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
}

/**
 * Build the inner token the plugin issues, so a test can tamper with the payload.
 *
 * Kept in sync with `AuthCore.legacyEncode` on purpose: a test must not import the code
 * it is checking.
 */
function signLegacyPayload(payload: unknown, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");

  return `${encoded}.${signature}`;
}
