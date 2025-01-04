import { defaultSecurity } from "@verdaccio/config";
import type { Config } from "@verdaccio/types";
import merge from "deepmerge";
import type { MockInstance } from "vitest";

import ParsedPluginConfig from "@/server/config/Config";
import * as utils from "@/server/config/utils";
import { ProviderType } from "@/server/plugin/AuthProvider";
import { StoreType } from "@/server/store/Store";

const mockConfig = {
  "provider-host": "https://provider.test",
  "client-id": "test-client-id",
  "client-secret": "test-client-secret",
};

const mockVerdaccioConfig = {
  secret: "test-secret",
  security: {},
  packages: {},
  url_prefix: "/prefix",
  self_path: "/test/path",
} as Config;

describe("ParsedPluginConfig", () => {
  it("should return secret from verdaccio config", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.secret).toBe("test-secret");
  });

  it("should merge default security with verdaccio config", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.security).toEqual(merge(defaultSecurity, {}));
  });

  it("should return packages from verdaccio config", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.packages).toEqual({});
  });

  it("should return url prefix from verdaccio config", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.urlPrefix).toBe("/prefix");
  });

  it("should get provider host from config", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.providerHost).toBe("https://provider.test");
  });

  it("should get optional provider type", () => {
    const configWithType = {
      ...mockConfig,
      "provider-type": ProviderType.Gitlab,
    };
    const config = new ParsedPluginConfig(configWithType, mockVerdaccioConfig);
    expect(config.providerType).toBe(ProviderType.Gitlab);
  });

  it("should get client credentials", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.clientId).toBe("test-client-id");
    expect(config.clientSecret).toBe("test-client-secret");
  });

  it("should get default scope if not specified", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.scope).toBe("openid");
  });

  it("should get default username claim if not specified", () => {
    const config = new ParsedPluginConfig(mockConfig, mockVerdaccioConfig);
    expect(config.usernameClaim).toBe("sub");
  });

  it("should get store config for in-memory store", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.InMemory,
      },
      mockVerdaccioConfig,
    );
    expect(config.storeType).toBe(StoreType.InMemory);
    expect(config.getStoreConfig(StoreType.InMemory)).toBeUndefined();
  });

  it("should handle environment variables", () => {
    vi.spyOn(utils, "getEnvironmentValue").mockReturnValue("env-value");
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "client-id": "$CLIENT_ID",
      },
      mockVerdaccioConfig,
    );
    expect(config.clientId).toBe("env-value");
  });
});

describe("Invalid ParsedPluginConfig", () => {
  let exitMock: MockInstance<never>;

  beforeEach(() => {
    exitMock = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    exitMock.mockRestore();
  });

  it("should throw error if provider host is not specified", () => {
    const config = new ParsedPluginConfig({} as any, mockVerdaccioConfig);

    expect(() => config.providerHost).toThrowError("process.exit called");
  });

  it("should throw error if client id is not specified", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "client-id": "",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.clientId).toThrowError("process.exit called");
  });

  it("should throw error if client secret is not specified", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "client-secret": "",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.clientSecret).toThrowError("process.exit called");
  });

  it("should throw error if provider type is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "provider-type": "invalid" as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => config.providerType).toThrowError("process.exit called");
  });

  it("should throw error if configuration uri is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "configuration-uri": "invalid-uri",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.configurationUri).toThrowError("process.exit called");
  });

  it("should throw error if issuer is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        issuer: "invalid-uri",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.issuer).toThrowError("process.exit called");
  });

  it("should throw error if authorization endpoint is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "authorization-endpoint": "invalid-uri",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.authorizationEndpoint).toThrowError("process.exit called");
  });

  it("should throw error if token endpoint is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "token-endpoint": "invalid-uri",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.tokenEndpoint).toThrowError("process.exit called");
  });

  it("should throw error if userinfo endpoint is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "userinfo-endpoint": "invalid-uri",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.userinfoEndpoint).toThrowError("process.exit called");
  });

  it("should throw error if jwks uri is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "jwks-uri": "invalid-uri",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.jwksUri).toThrowError("process.exit called");
  });

  it("should throw error if store type is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": "invalid" as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => config.storeType).toThrowError("process.exit called");
  });

  it("should throw error if store config is invalid", () => {
    const configInMemory = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.InMemory,
        "store-config": "invalid" as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => configInMemory.getStoreConfig(StoreType.InMemory)).toThrowError("process.exit called");

    const configRedis = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.Redis,
        "store-config": "invalid" as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => configRedis.getStoreConfig(StoreType.Redis)).toThrowError("process.exit called");
  });

  it("should throw error if authorized groups is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "authorized-groups": 123 as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => config.authorizedGroups).toThrowError("process.exit called");
  });
});
