/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Groups } from "@gitbeaker/rest";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigHolder } from "@/server/config/Config";
import { ERRORS } from "@/server/constants";
import { OpenIDConnectAuthProvider } from "@/server/openid/AuthProvider";
import { ProviderType, type TokenInfo } from "@/server/plugin/AuthProvider";
import type { Store } from "@/server/store/Store";

// Mock openid-client module
vi.mock("openid-client", () => ({
  randomState: vi.fn(() => "mock-state-12345"),
  randomNonce: vi.fn(() => "mock-nonce-67890"),
  buildAuthorizationUrl: vi.fn((_config, params) => {
    const url = new URL("https://provider.example.com/authorize");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url;
  }),
  authorizationCodeGrant: vi.fn(() => ({
    access_token: "mock-access-token",
    id_token: "header.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzAwMDAwMDAwfQ.signature",
    expires_in: 3600,
    claims: () => ({ sub: "user123", exp: 1_700_000_000 }),
  })),
  fetchUserInfo: vi.fn(() => ({
    sub: "user123",
    name: "Test User",
    email: "test@example.com",
    groups: ["group1", "group2"],
  })),
  skipSubjectCheck: Symbol("skipSubjectCheck"),
  discovery: vi.fn(() => ({
    serverMetadata: () => ({
      issuer: "https://provider.example.com",
      authorization_endpoint: "https://provider.example.com/authorize",
      token_endpoint: "https://provider.example.com/token",
    }),
    clientMetadata: () => ({
      client_id: "test-client-id",
    }),
  })),
  Configuration: vi.fn(function (this: any, serverMetadata, clientId, metadata, _clientAuth) {
    this.serverMetadata = () => serverMetadata;
    this.clientMetadata = () => ({ client_id: clientId, ...metadata });
  }),
  ClientSecretPost: vi.fn((secret) => (as, client, body: URLSearchParams, _headers) => {
    body.set("client_id", client.client_id);
    body.set("client_secret", secret);
  }),
}));

// Mock @gitbeaker/rest
vi.mock("@gitbeaker/rest", () => ({
  Groups: vi.fn(function (this: any, options) {
    this.host = options.host;
    this.oauthToken = options.oauthToken;
    this.all = vi.fn(() => [{ name: "gitlab-group1" }, { name: "gitlab-group2" }, { name: "gitlab-group3" }]);
  }),
}));

// Mock logger
vi.mock("@/server/logger", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock debugger
vi.mock("@/server/debugger", () => ({
  debug: vi.fn(),
}));

// Mock @verdaccio/url
vi.mock("@verdaccio/url", () => ({
  getPublicUrl: vi.fn(() => "https://registry.example.com/"),
}));

describe("OpenIDConnectAuthProvider", () => {
  let mockConfig: ConfigHolder;
  let mockStore: Store;
  let provider: OpenIDConnectAuthProvider;
  let processExitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.exit to prevent actual exit in tests
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never;
    });

    mockConfig = {
      providerHost: "https://provider.example.com",
      providerType: undefined,
      configurationUri: undefined,
      issuer: "https://provider.example.com",
      authorizationEndpoint: "https://provider.example.com/authorize",
      tokenEndpoint: "https://provider.example.com/token",
      userinfoEndpoint: "https://provider.example.com/userinfo",
      jwksUri: "https://provider.example.com/.well-known/jwks.json",
      scope: "openid profile email",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      usernameClaim: "sub",
      groupsClaim: "groups",
      authorizedGroups: true,
      groupUsers: undefined,
      storeType: "memory" as any,
      secret: "test-secret",
      security: {} as any,
      urlPrefix: "",
      packages: {},
      keepPasswdLogin: false,
      loginButtonText: "Login",
      getStoreConfig: vi.fn(() => ({})),
    };

    mockStore = {
      setOpenIDState: vi.fn(() => {
        // no-op
      }),
      getOpenIDState: vi.fn(() => "mock-nonce-67890"),
      deleteOpenIDState: vi.fn(() => {
        // no-op
      }),
      setUserInfo: vi.fn(() => {
        // no-op
      }),
      getUserInfo: vi.fn(() => {
        // no-op
      }),
      setUserGroups: vi.fn(() => {
        // no-op
      }),
      getUserGroups: vi.fn(() => {
        // no-op
      }),
      setWebAuthnToken: vi.fn(() => {
        // no-op
      }),
      getWebAuthnToken: vi.fn(() => {
        // no-op
      }),
      deleteWebAuthnToken: vi.fn(() => {
        // no-op
      }),
      close: vi.fn(),
    };
  });

  describe("getId", () => {
    it("should return 'openid'", async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(provider.getId()).toBe("openid");
    });
  });

  describe("getLoginUrl", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should generate login URL with state and nonce", async () => {
      const redirectUrl = "https://registry.example.com/callback";
      const loginUrl = await provider.getLoginUrl(redirectUrl);

      expect(loginUrl).toContain("https://provider.example.com/authorize");
      expect(loginUrl).toContain("state=mock-state-12345");
      expect(loginUrl).toContain("nonce=mock-nonce-67890");
      expect(loginUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUrl)}`);
      // URL encoding uses + for spaces
      expect(loginUrl).toContain("scope=openid+profile+email");

      expect(mockStore.setOpenIDState).toHaveBeenCalledWith("mock-state-12345", "mock-nonce-67890", "openid");
    });

    it("should use custom state if provided", async () => {
      const redirectUrl = "https://registry.example.com/callback";
      const customState = "custom-state-xyz";
      const loginUrl = await provider.getLoginUrl(redirectUrl, customState);

      expect(loginUrl).toContain(`state=${customState}`);
      expect(mockStore.setOpenIDState).toHaveBeenCalledWith(customState, "mock-nonce-67890", "openid");
    });
  });

  describe("getToken", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should exchange authorization code for tokens", async () => {
      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn((header: string) => {
          if (header === "host") return "registry.example.com";
          return;
        }),
      } as unknown as Request;

      const tokenInfo = await provider.getToken(mockRequest);

      expect(tokenInfo).toEqual({
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzAwMDAwMDAwfQ.signature",
        expiresAt: expect.any(Number),
      });

      expect(mockStore.getOpenIDState).toHaveBeenCalledWith("mock-state-12345", "openid");
      expect(mockStore.deleteOpenIDState).toHaveBeenCalledWith("mock-state-12345", "openid");
    });

    it("should throw error if state parameter is missing", async () => {
      const mockRequest = {
        url: "/callback?code=auth-code-123",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow(ERRORS.NO_STATE);
    });

    it("should throw error if state is not found in store", async () => {
      mockStore.getOpenIDState = vi.fn(() => null);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=invalid-state",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow(ERRORS.STATE_NOT_FOUND);
    });
  });

  describe("getUserinfo", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should get userinfo from id_token", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken:
          "header.eyJzdWIiOiJ1c2VyMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsImdyb3VwcyI6WyJncm91cDEiLCJncm91cDIiXX0.signature",
        expiresAt: 1_700_000_000,
      };

      const userinfo = await provider.getUserinfo(tokenInfo);

      expect(userinfo).toEqual({
        name: "user123",
        groups: ["group1", "group2"],
      });
    });

    it("should get userinfo from userinfo endpoint when id_token doesn't have required claims", async () => {
      mockConfig.usernameClaim = "name";

      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      const userinfo = await provider.getUserinfo(tokenInfo);

      expect(userinfo).toEqual({
        name: "Test User",
        groups: ["group1", "group2"],
      });
    });

    it("should cache userinfo in store", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      mockConfig.usernameClaim = "name";

      await provider.getUserinfo(tokenInfo);

      expect(mockStore.setUserInfo).toHaveBeenCalled();
    });

    it("should use cached userinfo if available", async () => {
      const cachedUserinfo = {
        sub: "user123",
        name: "Cached User",
        groups: ["cached-group1"],
      };

      mockStore.getUserInfo = vi.fn(() => cachedUserinfo);

      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      mockConfig.usernameClaim = "name";

      const userinfo = await provider.getUserinfo(tokenInfo);

      expect(userinfo.name).toBe("Cached User");
    });

    it("should throw error if username cannot be determined", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.e30.signature", // Empty claims {}
        expiresAt: 1_700_000_000,
      };

      const { fetchUserInfo } = await import("openid-client");
      vi.mocked(fetchUserInfo).mockResolvedValueOnce({} as any);

      mockConfig.usernameClaim = "email";

      await expect(provider.getUserinfo(tokenInfo)).rejects.toThrow('Could not get username with claim: "email"');
    });

    it("should convert groups to string array", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIiwiZ3JvdXBzIjoic2luZ2xlLWdyb3VwIn0.signature",
        expiresAt: 1_700_000_000,
      };

      const userinfo = await provider.getUserinfo(tokenInfo);

      expect(userinfo).toEqual({
        name: "user123",
        groups: ["single-group"],
      });
    });
  });

  describe("getGroupsWithProviderType", () => {
    beforeEach(async () => {
      mockConfig.providerType = ProviderType.Gitlab;
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should fetch gitlab groups when providerType is Gitlab", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      mockConfig.usernameClaim = "name";

      const userinfo = await provider.getUserinfo(tokenInfo);

      expect(userinfo).toEqual({
        name: "Test User",
        groups: ["gitlab-group1", "gitlab-group2", "gitlab-group3"],
      });
    });

    it("should cache gitlab groups in store", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      mockConfig.usernameClaim = "name";

      await provider.getUserinfo(tokenInfo);

      expect(mockStore.setUserGroups).toHaveBeenCalled();
    });

    it("should use cached groups if available", async () => {
      const cachedGroups = ["cached-gitlab-group1", "cached-gitlab-group2"];
      mockStore.getUserGroups = vi.fn(() => cachedGroups);

      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "mock-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      mockConfig.usernameClaim = "name";

      const userinfo = await provider.getUserinfo(tokenInfo);

      expect(userinfo.groups).toEqual(cachedGroups);
    });
  });

  describe("getGitlabGroups", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      // Wait for discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should fetch groups from Gitlab API", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "gitlab-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      const groups = await provider.getGitlabGroups(tokenInfo);

      expect(groups).toEqual(["gitlab-group1", "gitlab-group2", "gitlab-group3"]);
      expect(Groups).toHaveBeenCalledWith({
        host: "https://provider.example.com",
        oauthToken: "gitlab-access-token",
      });
    });

    it("should handle string token", async () => {
      const token = "gitlab-access-token-string";

      const groups = await provider.getGitlabGroups(token);

      expect(groups).toEqual(["gitlab-group1", "gitlab-group2", "gitlab-group3"]);
      expect(Groups).toHaveBeenCalledWith({
        host: "https://provider.example.com",
        oauthToken: token,
      });
    });
  });

  describe("error handling", () => {
    it("should handle discovery errors gracefully", async () => {
      const { discovery } = await import("openid-client");
      vi.mocked(discovery).mockRejectedValueOnce(new Error("Discovery failed"));

      mockConfig.configurationUri = "https://provider.example.com/.well-known/openid-configuration";

      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);

      // Wait for discovery to fail and error to be logged
      await new Promise((resolve) => setTimeout(resolve, 100));

      const logger = await import("@/server/logger");
      expect(logger.default.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
