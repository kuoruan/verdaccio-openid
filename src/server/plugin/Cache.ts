import { Cache as MemoryCache } from "memory-cache";

/**
 * When installing packages, the CLI makes a burst of package requests.
 *
 * If we were to perform a full authentication check and fetch the provider groups
 * on each package request, this would slow down the process a lot and we would
 * likely hit a request limit with the auth provider.
 *
 * Therefore authentication is only performed once and is cached until no request
 * has been made for a short period.
 */
export class Cache {
  private readonly groupsCache = new MemoryCache<string, string[]>();
  private readonly providerTokenCache = new MemoryCache<string, string>();

  constructor(private readonly namespace: string) {}

  private getKey(str: string): string {
    return this.namespace + "_" + str;
  }

  getGroups(key: string): string[] | null {
    return this.groupsCache.get(this.getKey(key));
  }

  setGroups(key: string, groups: string[]): void {
    this.groupsCache.put(this.getKey(key), groups, 5 * 60 * 1000); // 5m
  }

  setProviderToken(key: string, providerToken: string, ttl?: number) {
    this.providerTokenCache.put(this.getKey(key), providerToken, ttl);
  }

  getProviderToken(key: string): string | null {
    return this.providerTokenCache.get(this.getKey(key));
  }
}
