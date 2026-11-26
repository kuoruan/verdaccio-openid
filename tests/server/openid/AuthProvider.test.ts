import { getPublicUrl } from "@verdaccio/url";
import type { Request } from "express";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { authorizationCodeGrant, customFetch, discovery, fetchUserInfo } from "openid-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigHolder } from "@/server/config/Config";
import { hashObject } from "@/server/crypto";
import logger from "@/server/logger";
import { ERRORS } from "@/server/constants";
import { OpenIDConnectAuthProvider } from "@/server/openid/AuthProvider";
import { getGitlabGroups as fetchGitlabGroups } from "@/server/openid/provider/gitlab";
import { ProviderType, type TokenInfo } from "@/server/plugin/AuthProvider";
import type { OpenIDStateStore, ProviderCache } from "@/server/store/Store";

// Mock openid-client module
vi.mock("openid-client", () => ({
  customFetch: Symbol.for("openid-client:customFetch"),
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
  Configuration: vi.fn(function (serverMetadata, clientId, metadata, _clientAuth) {
    return {
      serverMetadata: () => serverMetadata,
      clientMetadata: () => ({ client_id: clientId, ...metadata }),
    };
  }),
  ClientSecretPost: vi.fn((secret) => (as, client, body: URLSearchParams, _headers) => {
    body.set("client_id", client.client_id);
    body.set("client_secret", secret);
  }),
}));

const groupsPath = "https://provider.example.com/api/v4/groups";
const groupPage1 = [
  { name: "gitlab-group1", path: "gitlab-group1", full_path: "gitlab-group1" },
  { name: "gitlab-group2", path: "gitlab-group2", full_path: "team/gitlab-group2" },
];
const groupPage2 = [
  // A nested group may be named like any group; only its full path tells them apart.
  { name: "gitlab-group3", path: "gitlab-group3", full_path: "someone-else/gitlab-group3" },
];
const seenGroups: { url: string; token: string | null }[] = [];

/** Record the request and check the contract the GitLab call must keep. */
function checkGroupsRequest(request: { url: string; headers: Headers }, expectedToken?: string): URL {
  const url = new URL(request.url);
  seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
  expect(url.searchParams.get("all_available")).toBe("false");
  expect(url.searchParams.get("per_page")).toBe("100");
  const authorization = request.headers.get("authorization");
  if (expectedToken === undefined) expect(authorization).toMatch(/^Bearer /);
  else expect(authorization).toBe(`Bearer ${expectedToken}`);
  return url;
}

function linkTo(page: number): string {
  return `<${groupsPath}?all_available=false&per_page=100&page=${String(page)}>; rel="next"`;
}

const server = setupServer(
  http.get(groupsPath, ({ request }) => {
    const url = checkGroupsRequest(request);
    if (url.searchParams.get("page") === "2") return HttpResponse.json(groupPage2);
    return HttpResponse.json(groupPage1, { headers: { link: linkTo(2) } });
  }),
);

beforeAll(() => {
  // A request without a handler must fail the test, not reach the network.
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Mock logger
vi.mock("@/server/logger", () => ({
  default: {
    info: vi.fn(),
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
  let mockStore: OpenIDStateStore & ProviderCache;
  let provider: OpenIDConnectAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.exit to prevent actual exit in tests
    vi.spyOn(process, "exit").mockImplementation(() => {
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
      getUserInfo: vi.fn(() => undefined),
      setUserGroups: vi.fn(() => {
        // no-op
      }),
      getUserGroups: vi.fn(() => undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function waitForConfiguration() {
    await vi.waitFor(
      () => {
        expect(logger.info).toHaveBeenCalledWith("OpenID Connect configuration discovery completed successfully");
      },
      { interval: 1 },
    );
  }

  describe("getId", () => {
    it("should return 'openid'", async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();

      expect(provider.getId()).toBe("openid");
    });
  });

  describe("getLoginUrl", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();
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

    it("should reuse in-flight discovery started by the constructor", async () => {
      mockConfig.authorizationEndpoint = undefined;
      mockConfig.tokenEndpoint = undefined;
      mockConfig.userinfoEndpoint = undefined;
      mockConfig.jwksUri = undefined;

      let resolveDiscovery!: (value: any) => void;
      const discoveryPromise = new Promise<any>((resolve) => {
        resolveDiscovery = resolve;
      });

      vi.mocked(discovery).mockReturnValueOnce(discoveryPromise as any);

      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);

      const loginUrlPromise = provider.getLoginUrl("https://registry.example.com/callback");

      await vi.waitFor(() => expect(discovery).toHaveBeenCalledTimes(1), { interval: 1 });

      resolveDiscovery({
        serverMetadata: () => ({
          issuer: "https://provider.example.com",
          authorization_endpoint: "https://provider.example.com/authorize",
          token_endpoint: "https://provider.example.com/token",
        }),
        clientMetadata: () => ({
          client_id: "test-client-id",
        }),
      });

      const loginUrl = await loginUrlPromise;

      expect(loginUrl).toContain("https://provider.example.com/authorize");
      expect(discovery).toHaveBeenCalledTimes(1);
    });
  });

  describe("getToken", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();
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
      mockStore.getOpenIDState = vi.fn(() => undefined);

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

    it("should preserve url_prefix when req.url does not include it (reverse proxy scenario)", async () => {
      vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

      mockConfig.urlPrefix = "/prefix/";

      const mockRequest = {
        url: "/-/oauth/callback/authn?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/-/oauth/callback/authn",
        headers: {},
        get: vi.fn((header: string) => {
          if (header === "host") return "registry.example.com";
          return;
        }),
      } as unknown as Request;

      await provider.getToken(mockRequest);

      const calledUrl = vi.mocked(authorizationCodeGrant).mock.calls[0]?.[1] as URL;
      expect(calledUrl.href).toBe(
        "https://registry.example.com/prefix/-/oauth/callback/authn?code=auth-code-123&state=mock-state-12345",
      );
    });

    it("should not duplicate url_prefix when req.url already includes it", async () => {
      vi.mocked(getPublicUrl).mockReturnValueOnce("https://registry.example.com/prefix/");

      mockConfig.urlPrefix = "/prefix/";

      const mockRequest = {
        url: "/prefix/-/oauth/callback/authn?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/prefix/-/oauth/callback/authn",
        headers: {},
        get: vi.fn((header: string) => {
          if (header === "host") return "registry.example.com";
          return;
        }),
      } as unknown as Request;

      await provider.getToken(mockRequest);

      const calledUrl = vi.mocked(authorizationCodeGrant).mock.calls[0]?.[1] as URL;
      expect(calledUrl.href).toBe(
        "https://registry.example.com/prefix/-/oauth/callback/authn?code=auth-code-123&state=mock-state-12345",
      );
    });

    it("should throw error if access_token is missing", async () => {
      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: undefined,
        id_token: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expires_in: 3600,
        claims: () => ({ sub: "user123" }),
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow(ERRORS.NO_ACCESS_TOKEN_RETURNED);
    });

    it("should throw error if id_token is missing when scope includes openid", async () => {
      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: "mock-access-token",
        id_token: undefined,
        expires_in: 3600,
        claims: () => ({ sub: "user123" }),
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow(ERRORS.NO_ID_TOKEN_RETURNED);
    });

    it("should not require id_token when scope does not include openid", async () => {
      mockConfig.scope = "profile email";
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);

      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: "mock-access-token",
        id_token: undefined,
        expires_in: 3600,
        claims: () => ({ sub: "user123" }),
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      const tokenInfo = await provider.getToken(mockRequest);
      expect(tokenInfo.accessToken).toBe("mock-access-token");
      expect(tokenInfo.idToken).toBeUndefined();
    });

    it("should throw error if no claims found in token response", async () => {
      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: "mock-access-token",
        id_token: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expires_in: 3600,
        claims: () => null,
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow(ERRORS.NO_CLAIMS_FOUND);
    });

    it("should delete state before token exchange even on failure", async () => {
      vi.mocked(authorizationCodeGrant).mockRejectedValueOnce(new Error("Token exchange failed"));

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow("Token exchange failed");

      // State must be consumed (deleted) before exchange to prevent replay attacks
      expect(mockStore.deleteOpenIDState).toHaveBeenCalledWith("mock-state-12345", "openid");
    });

    it("should calculate expiresAt from expires_in", async () => {
      const nowSec = Math.trunc(Date.now() / 1000);
      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: "mock-access-token",
        id_token: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expires_in: 7200,
        claims: () => ({ sub: "user123" }),
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      const tokenInfo = await provider.getToken(mockRequest);

      expect(tokenInfo.expiresAt).toBe(nowSec + 7200);
    });

    it("should fallback expiresAt to claims.exp when expires_in is not set", async () => {
      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: "mock-access-token",
        id_token: "header.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzAwMDAwMDAwfQ.signature",
        expires_in: undefined,
        claims: () => ({ sub: "user123", exp: 1_700_000_000 }),
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      const tokenInfo = await provider.getToken(mockRequest);

      expect(tokenInfo.expiresAt).toBe(1_700_000_000);
    });

    it("should propagate error when claims() throws", async () => {
      vi.mocked(authorizationCodeGrant).mockResolvedValueOnce({
        access_token: "mock-access-token",
        id_token: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expires_in: 3600,
        claims: () => {
          throw new Error("claims parsing failed");
        },
      } as any);

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow("claims parsing failed");
    });

    it("should propagate error when getOpenIDState throws", async () => {
      mockStore.getOpenIDState = vi.fn(() => {
        throw new Error("store connection failed");
      });

      const mockRequest = {
        url: "/callback?code=auth-code-123&state=mock-state-12345",
        protocol: "https",
        hostname: "registry.example.com",
        path: "/callback",
        headers: {},
        get: vi.fn(() => "registry.example.com"),
      } as unknown as Request;

      await expect(provider.getToken(mockRequest)).rejects.toThrow("store connection failed");
    });
  });

  describe("getUserinfo", () => {
    beforeEach(async () => {
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();
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
        subject: "user123",
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
        subject: "user123",
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
        subject: "user123",
      });
    });
  });

  describe("getGroupsWithProviderType", () => {
    beforeEach(async () => {
      mockConfig.providerType = ProviderType.Gitlab;
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();
    });

    it.each([
      ["access token", "raw-token", "raw-token"],
      ["subject", { accessToken: "token", subject: "user123" }, "user123"],
      ["token without subject", { accessToken: "token" }, hashObject({ accessToken: "token" })],
    ])("uses the same cache key for userinfo and groups: %s", async (_label, token, key) => {
      mockConfig.usernameClaim = "name";

      await provider.getUserinfo(token);

      expect(mockStore.getUserInfo).toHaveBeenCalledWith(key, "openid");
      expect(mockStore.setUserInfo).toHaveBeenCalledWith(key, expect.any(Object), "openid");
      expect(mockStore.getUserGroups).toHaveBeenCalledWith(key, "openid");
      expect(mockStore.setUserGroups).toHaveBeenCalledWith(key, expect.any(Array), "openid");
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
        groups: ["gitlab-group1", "team/gitlab-group2", "someone-else/gitlab-group3"],
        subject: "user123",
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
      await waitForConfiguration();
      seenGroups.length = 0;
      // Pin the exact token here; other suites reuse this server with their own tokens.
      server.use(
        http.get(groupsPath, ({ request }) => {
          const url = checkGroupsRequest(request, "gitlab-access-token");
          if (url.searchParams.get("page") === "2") return HttpResponse.json(groupPage2);
          return HttpResponse.json(groupPage1, { headers: { link: linkTo(2) } });
        }),
      );
    });

    it("follows the Link header and returns the full path of each group", async () => {
      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "gitlab-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      await expect(fetchGitlabGroups("https://provider.example.com", tokenInfo)).resolves.toEqual([
        "gitlab-group1",
        "team/gitlab-group2",
        "someone-else/gitlab-group3",
      ]);
      expect(seenGroups.map((s) => s.url)).toEqual([
        `${groupsPath}?all_available=false&per_page=100&page=1`,
        `${groupsPath}?all_available=false&per_page=100&page=2`,
      ]);
    });

    it("should handle string token", async () => {
      const token = "gitlab-access-token";

      await expect(fetchGitlabGroups("https://provider.example.com", token)).resolves.toEqual([
        "gitlab-group1",
        "team/gitlab-group2",
        "someone-else/gitlab-group3",
      ]);
    });

    it("rejects a bogus next link", async () => {
      server.use(
        http.get(groupsPath, ({ request }) => {
          seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
          return HttpResponse.json(groupPage1, { headers: { link: `<:::>; rel="next"` } });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).rejects.toThrow(
        /unexpected response/,
      );
      expect(mockStore.setUserGroups).not.toHaveBeenCalled();
    });

    it("rejects a next link that does not move forward", async () => {
      server.use(
        http.get(groupsPath, ({ request }) => {
          seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
          return HttpResponse.json(groupPage1, { headers: { link: linkTo(1) } });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).rejects.toThrow(
        /unexpected response/,
      );
      // Only the first page was requested; the self-referencing link was not followed.
      expect(seenGroups).toHaveLength(1);
      expect(mockStore.setUserGroups).not.toHaveBeenCalled();
    });

    it("rejects entries without a full path", async () => {
      server.use(
        http.get(groupsPath, ({ request }) => {
          seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
          return HttpResponse.json([{ full_path: "team/a" }, { name: "no-path" }]);
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).rejects.toThrow(
        /unexpected response/,
      );
      expect(mockStore.setUserGroups).not.toHaveBeenCalled();
    });

    it("rejects a non-array response", async () => {
      server.use(http.get(groupsPath, () => HttpResponse.json({})));

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).rejects.toThrow(
        /unexpected response/,
      );
    });

    it("retries a rate-limited first page", async () => {
      let calls = 0;
      server.use(
        http.get(groupsPath, ({ request }) => {
          calls += 1;
          if (calls === 1) return new HttpResponse(null, { status: 429 });
          const url = checkGroupsRequest(request, "gitlab-access-token");
          if (url.searchParams.get("page") === "2") return HttpResponse.json(groupPage2);
          return HttpResponse.json(groupPage1, { headers: { link: linkTo(2) } });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).resolves.toEqual([
        "gitlab-group1",
        "team/gitlab-group2",
        "someone-else/gitlab-group3",
      ]);
    });

    it("rejects when the second page fails", async () => {
      let calls = 0;
      server.use(
        http.get(groupsPath, ({ request }) => {
          calls += 1;
          seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
          if (calls > 1) return new HttpResponse(null, { status: 500 });
          return HttpResponse.json(groupPage1, { headers: { link: linkTo(2) } });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).rejects.toThrow(
        /status 500/,
      );
      expect(mockStore.setUserGroups).not.toHaveBeenCalled();
    });

    it("rejects a cross-origin next link without following it", async () => {
      server.use(
        http.get(groupsPath, () =>
          HttpResponse.json(groupPage1, {
            headers: { link: `<https://evil.example.com/api/v4/groups?page=2>; rel="next"` },
          }),
        ),
      );
      const fetched: string[] = [];
      const recordingFetch = (async (input: any, init?: any) => {
        fetched.push(String(input instanceof URL ? input.href : input));
        return fetch(input, init);
      }) as typeof fetch;

      await expect(
        fetchGitlabGroups("https://provider.example.com", "gitlab-access-token", recordingFetch),
      ).rejects.toThrow(/unexpected response/);
      // Only the first page was requested; the cross-origin link was not followed.
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toContain("page=1");
    });

    it("rejects a next link with an empty page without following it", async () => {
      server.use(
        http.get(groupsPath, () =>
          HttpResponse.json(groupPage1, {
            headers: { link: `<https://provider.example.com/api/v4/groups?page=>; rel="next"` },
          }),
        ),
      );
      const fetched: string[] = [];
      const recordingFetch = (async (input: any, init?: any) => {
        fetched.push(String(input instanceof URL ? input.href : input));
        return fetch(input, init);
      }) as typeof fetch;

      await expect(
        fetchGitlabGroups("https://provider.example.com", "gitlab-access-token", recordingFetch),
      ).rejects.toThrow(/unexpected response/);
      // Only the first page was requested; the empty-page link was not followed.
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toContain("page=1");
    });

    it("rejects a next link with an empty target without ending the walk", async () => {
      server.use(
        http.get(groupsPath, () =>
          HttpResponse.json(groupPage1, {
            headers: { link: `<>; rel="next"` },
          }),
        ),
      );
      const fetched: string[] = [];
      const recordingFetch = (async (input: any, init?: any) => {
        fetched.push(String(input instanceof URL ? input.href : input));
        return fetch(input, init);
      }) as typeof fetch;

      await expect(
        fetchGitlabGroups("https://provider.example.com", "gitlab-access-token", recordingFetch),
      ).rejects.toThrow(/unexpected response/);
      // A present-but-empty next link is unusable, not a normal end.
      expect(fetched).toHaveLength(1);
    });

    it("follows an unquoted next relation", async () => {
      server.use(
        http.get(groupsPath, ({ request }) => {
          const url = checkGroupsRequest(request, "gitlab-access-token");
          if (url.searchParams.get("page") === "2") return HttpResponse.json(groupPage2);
          return HttpResponse.json(groupPage1, {
            headers: { link: `<https://provider.example.com/api/v4/groups?page=2>; rel=next` },
          });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).resolves.toEqual([
        "gitlab-group1",
        "team/gitlab-group2",
        "someone-else/gitlab-group3",
      ]);
    });

    it("ends normally when rel=next only appears inside the target URL", async () => {
      server.use(
        http.get(groupsPath, () =>
          HttpResponse.json(groupPage1, {
            headers: {
              link: `<https://provider.example.com/api/v4/groups?page=2;rel=next;x=1>; rel="last"`,
            },
          }),
        ),
      );
      const fetched: string[] = [];
      const recordingFetch = (async (input: any, init?: any) => {
        fetched.push(String(input instanceof URL ? input.href : input));
        return fetch(input, init);
      }) as typeof fetch;

      // No next relation exists, so the first page is the whole result.
      await expect(
        fetchGitlabGroups("https://provider.example.com", "gitlab-access-token", recordingFetch),
      ).resolves.toEqual(["gitlab-group1", "team/gitlab-group2"]);
      expect(fetched).toHaveLength(1);
    });

    it("retries a 502 then continues the walk", async () => {
      let calls = 0;
      server.use(
        http.get(groupsPath, ({ request }) => {
          calls += 1;
          if (calls === 1) return new HttpResponse(null, { status: 502 });
          const url = checkGroupsRequest(request, "gitlab-access-token");
          if (url.searchParams.get("page") === "2") return HttpResponse.json(groupPage2);
          return HttpResponse.json(groupPage1, { headers: { link: linkTo(2) } });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).resolves.toEqual([
        "gitlab-group1",
        "team/gitlab-group2",
        "someone-else/gitlab-group3",
      ]);
      // The first page was tried twice, then page 2 followed.
      expect(calls).toBe(3);
    });

    it("throws after the page retries are exhausted", { timeout: 20_000 }, async () => {
      let calls = 0;
      server.use(
        http.get(groupsPath, () => {
          calls += 1;
          return new HttpResponse(null, { status: 502 });
        }),
      );

      await expect(fetchGitlabGroups("https://provider.example.com", "gitlab-access-token")).rejects.toThrow(
        /status 502/,
      );
      // 1 initial + 3 retries with 1s/2s/4s backoffs.
      expect(calls).toBe(4);
    });

    it("rejects a next link on another path without following it", async () => {
      server.use(
        http.get(groupsPath, () =>
          HttpResponse.json(groupPage1, {
            headers: { link: `<https://provider.example.com/api/v4/projects?page=2>; rel="next"` },
          }),
        ),
      );
      const fetched: string[] = [];
      const recordingFetch = (async (input: any, init?: any) => {
        fetched.push(String(input instanceof URL ? input.href : input));
        return fetch(input, init);
      }) as typeof fetch;

      await expect(
        fetchGitlabGroups("https://provider.example.com", "gitlab-access-token", recordingFetch),
      ).rejects.toThrow(/unexpected response/);
      // Only the first page was requested; the off-path link was not followed.
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toContain("page=1");
    });

    it("routes through the injected fetch when a transport is given", async () => {
      const seen: string[] = [];
      const customFetch = (async (input: any, init?: any) => {
        seen.push(String(input instanceof URL ? input.href : input));
        return fetch(input, init);
      }) as typeof fetch;

      mockConfig.providerType = ProviderType.Gitlab;
      mockConfig.usernameClaim = "name";
      const transported = new OpenIDConnectAuthProvider(mockConfig, mockStore, {
        fetch: customFetch,
        close: () => Promise.resolve(),
      });
      await waitForConfiguration();

      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "gitlab-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      await expect(transported.getUserinfo(tokenInfo)).resolves.toMatchObject({
        groups: ["gitlab-group1", "team/gitlab-group2", "someone-else/gitlab-group3"],
      });
      expect(seen).toHaveLength(2);
    });

    it("does not follow a redirect from the groups endpoint", async () => {
      mockConfig.providerType = ProviderType.Gitlab;
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();
      const evilHits: string[] = [];
      server.use(
        http.get(groupsPath, ({ request }) => {
          seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
          return new HttpResponse(null, { status: 302, headers: { location: "https://evil.example.com/x" } });
        }),
        http.get("https://evil.example.com/x", ({ request }) => {
          evilHits.push(request.url);
          return HttpResponse.json([]);
        }),
      );

      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "gitlab-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      await expect(provider.getUserinfo(tokenInfo)).rejects.toThrow(/status 302/);
      // One request went out, the redirect target was never touched.
      expect(seenGroups).toHaveLength(1);
      expect(evilHits).toHaveLength(0);
      expect(mockStore.setUserGroups).not.toHaveBeenCalled();
    });

    it("caches nothing when the second page fails through getUserinfo", async () => {
      mockConfig.providerType = ProviderType.Gitlab;
      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();
      let calls = 0;
      server.use(
        http.get(groupsPath, ({ request }) => {
          calls += 1;
          seenGroups.push({ url: request.url, token: request.headers.get("authorization") });
          if (calls > 1) return new HttpResponse(null, { status: 500 });
          return HttpResponse.json(groupPage1, { headers: { link: linkTo(2) } });
        }),
      );

      const tokenInfo: TokenInfo = {
        subject: "user123",
        accessToken: "gitlab-access-token",
        idToken: "header.eyJzdWIiOiJ1c2VyMTIzIn0.signature",
        expiresAt: 1_700_000_000,
      };

      await expect(provider.getUserinfo(tokenInfo)).rejects.toThrow(/status 500/);
      // Exactly two requests went out and no partial group list was cached.
      // (The userinfo cache write happens before the walk by existing design.)
      expect(calls).toBe(2);
      expect(mockStore.setUserGroups).not.toHaveBeenCalled();
    });
  });

  describe("proxy transport", () => {
    it("passes customFetch to discovery when a transport is given", async () => {
      mockConfig.authorizationEndpoint = undefined;
      mockConfig.tokenEndpoint = undefined;
      mockConfig.userinfoEndpoint = undefined;
      mockConfig.jwksUri = undefined;

      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore, {
        fetch: vi.fn() as any,
        close: () => Promise.resolve(),
      });
      await waitForConfiguration();

      const options = vi.mocked(discovery).mock.calls.at(-1)?.[4] as any;
      expect(options?.[customFetch]).toBeTypeOf("function");
    });

    it("does not pass customFetch without a transport", async () => {
      mockConfig.authorizationEndpoint = undefined;
      mockConfig.tokenEndpoint = undefined;
      mockConfig.userinfoEndpoint = undefined;
      mockConfig.jwksUri = undefined;

      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);
      await waitForConfiguration();

      const options = vi.mocked(discovery).mock.calls.at(-1)?.[4] as any;
      expect(options?.[customFetch]).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should handle discovery errors gracefully", async () => {
      vi.mocked(discovery).mockRejectedValueOnce(new Error("Discovery failed"));

      mockConfig.configurationUri = "https://provider.example.com/.well-known/openid-configuration";

      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled(), { interval: 1 });
      // Configuration discovery fails but process should not exit
      expect(process.exit).not.toHaveBeenCalled();
    });

    it("should fail fast during retry cooldown and retry after it expires", async () => {
      let now = 1_700_000_000_000;

      vi.spyOn(Date, "now").mockImplementation(() => now);

      mockConfig.authorizationEndpoint = undefined;
      mockConfig.tokenEndpoint = undefined;
      mockConfig.userinfoEndpoint = undefined;
      mockConfig.jwksUri = undefined;

      vi.mocked(discovery)
        .mockRejectedValueOnce(new Error("Discovery failed"))
        .mockResolvedValueOnce({
          serverMetadata: () => ({
            issuer: "https://provider.example.com",
            authorization_endpoint: "https://provider.example.com/authorize",
            token_endpoint: "https://provider.example.com/token",
          }),
          clientMetadata: () => ({
            client_id: "test-client-id",
          }),
        } as any);

      provider = new OpenIDConnectAuthProvider(mockConfig, mockStore);

      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled(), { interval: 1 });

      await expect(provider.getLoginUrl("https://registry.example.com/callback")).rejects.toThrow(
        "OpenID configuration discovery is cooling down after a recent failure. Retry after 5s. Last error: Could not discover OpenID configuration: Discovery failed",
      );

      expect(discovery).toHaveBeenCalledTimes(1);

      now += 5001;

      const loginUrl = await provider.getLoginUrl("https://registry.example.com/callback");

      expect(loginUrl).toContain("https://provider.example.com/authorize");
      expect(discovery).toHaveBeenCalledTimes(2);
    });
  });
});
