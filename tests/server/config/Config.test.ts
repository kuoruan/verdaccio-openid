import { defaultSecurity } from "@verdaccio/config";
import type { Config } from "@verdaccio/types";
import merge from "deepmerge";

import ParsedPluginConfig from "@/server/config/Config";
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

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("should get redis store config for redis store", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.Redis,
        "store-config": "redis://redis-host:1234/0",
      },
      mockVerdaccioConfig,
    );

    expect(config.storeType).toBe(StoreType.Redis);
    expect(config.getStoreConfig(StoreType.Redis)).toBe("redis://redis-host:1234/0");

    const config1 = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.Redis,
        "store-config": "rediss://redis-host:1234/0",
      },
      mockVerdaccioConfig,
    );

    expect(config1.getStoreConfig(StoreType.Redis)).toBe("rediss://redis-host:1234/0");

    const config2 = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.Redis,
        "store-config": {
          host: "redis-host",
          port: 1234,
          db: 0,
        },
      },
      mockVerdaccioConfig,
    );
    expect(config2.getStoreConfig(StoreType.Redis)).toEqual({
      host: "redis-host",
      port: 1234,
      db: 0,
    });
  });

  it("should leave ttl out of the store config when it is not set", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.InMemory,
        "store-config": { max: 1000 },
      },
      mockVerdaccioConfig,
    );

    const storeConfig = config.getStoreConfig(StoreType.InMemory) as Record<string, unknown>;

    expect(storeConfig).toEqual({ max: 1000 });
    expect("ttl" in storeConfig).toBe(false);
  });

  it("should resolve a duration ttl to milliseconds", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.File,
        "store-config": { dir: "/tmp/store", ttl: "2m" },
      },
      mockVerdaccioConfig,
    );

    expect(config.getStoreConfig(StoreType.File)).toMatchObject({ dir: "/tmp/store", ttl: 120_000 });
  });

  it("should reject an invalid ttl through the config schema", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.File,
        "store-config": { dir: "/tmp/store", ttl: "5x" },
      },
      mockVerdaccioConfig,
    );

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      config.getStoreConfig(StoreType.File);

      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
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
    vi.stubEnv("VERDACCIO_OPENID_CLIENT_ID", "env-value");

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
  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw error if provider host is not specified", () => {
    const config = new ParsedPluginConfig({} as any, mockVerdaccioConfig);

    expect(() => config.providerHost).toThrow("process.exit called");
  });

  it("should throw error if client id is not specified", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "client-id": "",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.clientId).toThrow("process.exit called");
  });

  it("should throw error if client secret is not specified", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "client-secret": "",
      },
      mockVerdaccioConfig,
    );

    expect(() => config.clientSecret).toThrow("process.exit called");
  });

  it("should throw error if provider type is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "provider-type": "invalid" as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => config.providerType).toThrow("process.exit called");
  });

  it.each([
    ["configuration-uri", "configurationUri"],
    ["issuer", "issuer"],
    ["authorization-endpoint", "authorizationEndpoint"],
    ["token-endpoint", "tokenEndpoint"],
    ["userinfo-endpoint", "userinfoEndpoint"],
    ["jwks-uri", "jwksUri"],
  ] as const)("should reject an invalid %s", (key, property) => {
    const config = new ParsedPluginConfig({ ...mockConfig, [key]: "invalid-uri" }, mockVerdaccioConfig);

    expect(() => config[property]).toThrow("process.exit called");
  });

  it("should throw error if store type is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": "invalid" as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => config.storeType).toThrow("process.exit called");
  });

  it("should throw error if store config is invalid", () => {
    const configInMemory = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.InMemory,
        "store-config": "invalid",
      },
      mockVerdaccioConfig,
    );

    expect(() => configInMemory.getStoreConfig(StoreType.InMemory)).toThrow("process.exit called");

    const configRedis = new ParsedPluginConfig(
      {
        ...mockConfig,
        "store-type": StoreType.Redis,
        "store-config": "invalid",
      },
      mockVerdaccioConfig,
    );

    expect(() => configRedis.getStoreConfig(StoreType.Redis)).toThrow("process.exit called");
  });

  it("should throw error if authorized groups is invalid", () => {
    const config = new ParsedPluginConfig(
      {
        ...mockConfig,
        "authorized-groups": 123 as any,
      },
      mockVerdaccioConfig,
    );

    expect(() => config.authorizedGroups).toThrow("process.exit called");
  });
});
