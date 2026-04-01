/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import process from "node:process";

import { errorUtils } from "@verdaccio/core";
import type { AuthPackageAllow, RemoteUser } from "@verdaccio/types";

import { Plugin } from "@/server/plugin/Plugin";

// Mock dependencies
vi.mock("@/server/proxy-agent");
vi.mock("@/server/store");
vi.mock("@/server/openid/client");

// Mock openid-client to prevent discovery errors
vi.mock("openid-client", () => ({
  randomState: vi.fn(() => "mock-state"),
  randomNonce: vi.fn(() => "mock-nonce"),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
  fetchUserInfo: vi.fn(),
  skipSubjectCheck: Symbol("skipSubjectCheck"),
  discovery: vi.fn(() => ({
    serverMetadata: () => ({
      issuer: "https://example.com",
      authorization_endpoint: "https://example.com/authorize",
      token_endpoint: "https://example.com/token",
    }),
    clientMetadata: () => ({ client_id: "test-client-id" }),
  })),
  Configuration: vi.fn(function (this: any, serverMetadata, clientId, metadata) {
    this.serverMetadata = () => serverMetadata;
    this.clientMetadata = () => ({ client_id: clientId, ...metadata });
  }),
}));

describe("Plugin permission methods", () => {
  let plugin: Plugin;

  interface MockCore {
    authenticate: ReturnType<typeof vi.fn>;
    getLoggedUserGroups: ReturnType<typeof vi.fn>;
    getNonLoggedUserGroups: ReturnType<typeof vi.fn>;
    setAuth: ReturnType<typeof vi.fn>;
    verifyNpmToken: ReturnType<typeof vi.fn>;
  }

  let mockCore: MockCore;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock process.exit to prevent actual exit in tests
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never;
    });

    // Create a minimal Plugin instance
    mockCore = {
      authenticate: vi.fn(),
      getLoggedUserGroups: vi.fn(),
      getNonLoggedUserGroups: vi.fn(),
      setAuth: vi.fn(),
      verifyNpmToken: vi.fn(),
    };

    // Create Plugin with minimal config
    plugin = new Plugin(
      {
        "provider-host": "https://example.com",
        "client-id": "test-client",
        "client-secret": "test-secret",
      },
      {
        config: {
          secret: "test-secret",
          packages: {},
          http_proxy: undefined,
          https_proxy: undefined,
          no_proxy: undefined,
        },
        logger: {
          child: vi.fn().mockReturnThis(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
        },
      } as any,
    );

    // Replace core with our mock
    (plugin as any).core = mockCore;
  });

  afterEach(() => {
    vi.clearAllMocks();
    processExitSpy?.mockRestore();

    // Clean up signal handlers after each test to prevent MaxListenersExceededWarning
    plugin.unregisterSignalHandlers();
  });

  describe("allow_access", () => {
    it("should grant access when user is in required groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["admin"], real_groups: ["admin"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        version: "1.0.0",
        access: ["admin"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["admin"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
      expect(mockCore.authenticate).toHaveBeenCalledWith("test-user", ["admin"]);
    });

    it("should deny access when user is not in required groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        version: "1.0.0",
        access: ["admin"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["developer"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(
        errorUtils.getForbidden("user test-user is not allowed to access package test-package@1.0.0"),
      );
    });

    it("should include package spec in error message", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "my-package",
        tag: "latest",
        access: ["admin"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["developer"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(
        errorUtils.getForbidden("user test-user is not allowed to access package my-package@latest"),
      );
    });
  });

  describe("allow_publish", () => {
    it("should grant publish when user is in required groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["maintainer"], real_groups: ["maintainer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        version: "1.0.0",
        publish: ["maintainer"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["maintainer"]);

      plugin.allow_publish(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should deny publish when user is not in required groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["reader"], real_groups: ["reader"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        publish: ["maintainer"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["reader"]);

      plugin.allow_publish(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(
        errorUtils.getForbidden("user test-user is not allowed to publish package test-package"),
      );
    });
  });

  describe("allow_unpublish", () => {
    it("should grant unpublish when user is in required groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["admin"], real_groups: ["admin"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        version: "1.0.0",
        unpublish: ["admin"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["admin"]);

      plugin.allow_unpublish(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should allow next auth plugin when unpublish is false", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        unpublish: false,
      };
      const callback = vi.fn();

      plugin.allow_unpublish(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null);
      expect(mockCore.authenticate).not.toHaveBeenCalled();
    });

    it("should return internal error when unpublish is true", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        unpublish: true,
      };
      const callback = vi.fn();

      plugin.allow_unpublish(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(
        errorUtils.getInternalError("invalid unpublish configuration for package test-package"),
      );
    });

    it("should deny unpublish when user is not in required groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        version: "2.0.0",
        unpublish: ["admin"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["developer"]);

      plugin.allow_unpublish(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(
        errorUtils.getForbidden("user test-user is not allowed to unpublish package test-package@2.0.0"),
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle unauthenticated user with non-logged groups", () => {
      const user: RemoteUser = { name: "test-user", groups: ["some-group"], real_groups: ["some-group"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        access: ["public"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(false);
      mockCore.getNonLoggedUserGroups.mockReturnValue(["public", "read-only"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
      expect(mockCore.getNonLoggedUserGroups).toHaveBeenCalled();
    });

    it("should handle scoped packages", () => {
      const user: RemoteUser = { name: "test-user", groups: ["team-a"], real_groups: ["team-a"] };
      const pkg: AuthPackageAllow = {
        name: "@scope/package",
        version: "1.0.0",
        access: ["team-a"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["team-a"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should handle package with tag", () => {
      const user: RemoteUser = { name: "test-user", groups: ["admin"], real_groups: ["admin"] };
      const pkg: AuthPackageAllow = {
        name: "my-package",
        tag: "latest",
        access: ["admin"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["admin"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should handle package without version or tag", () => {
      const user: RemoteUser = { name: "test-user", groups: ["public"], real_groups: ["public"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        access: ["public"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["public"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should handle multiple required groups (allow if matches any)", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        access: ["admin", "developer", "maintainer"],
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["developer"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should handle user name matching group directly", () => {
      const user: RemoteUser = { name: "test-user", groups: ["developer"], real_groups: ["developer"] };
      const pkg: AuthPackageAllow = {
        name: "test-package",
        access: ["test-user"], // User name matches group
      };
      const callback = vi.fn();

      mockCore.authenticate.mockReturnValue(true);
      mockCore.getLoggedUserGroups.mockReturnValue(["developer"]);

      plugin.allow_access(user, pkg, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe("signal handler management", () => {
    it("should register signal handlers via registerSignalHandlers method", () => {
      const processOnSpy = vi.spyOn(process, "once");

      plugin.registerSignalHandlers();

      // Check that process.once was called for each signal
      expect(processOnSpy).toHaveBeenCalledTimes(4);
      expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith("SIGQUIT", expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith("SIGHUP", expect.any(Function));

      processOnSpy.mockRestore();
    });

    it("should unregister signal handlers via unregisterSignalHandlers method", () => {
      const processRemoveSpy = vi.spyOn(process, "removeListener");

      plugin.unregisterSignalHandlers();

      // Check that process.removeListener was called for each signal
      expect(processRemoveSpy).toHaveBeenCalledTimes(4);
      expect(processRemoveSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(processRemoveSpy).toHaveBeenCalledWith("SIGQUIT", expect.any(Function));
      expect(processRemoveSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      expect(processRemoveSpy).toHaveBeenCalledWith("SIGHUP", expect.any(Function));

      processRemoveSpy.mockRestore();
    });

    it("should unregister existing handlers before registering new ones", () => {
      const processOnSpy = vi.spyOn(process, "once");
      const processRemoveSpy = vi.spyOn(process, "removeListener");

      // Call registerSignalHandlers twice
      plugin.registerSignalHandlers();
      plugin.registerSignalHandlers();

      // Verify that unregister was called before the second registration
      expect(processRemoveSpy).toHaveBeenCalled();

      processOnSpy.mockRestore();
      processRemoveSpy.mockRestore();
    });
  });
});
