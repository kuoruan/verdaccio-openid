import TTLCache from "@isaacs/ttlcache";

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
  private readonly groupsCache: TTLCache<string, string[]>;
  private readonly providerTokenCache: TTLCache<string, string>;

  constructor(private readonly namespace: string) {
    this.groupsCache = new TTLCache({ max: 1000, ttl: 5 * 60 * 1000 }); // 5m;
    this.providerTokenCache = new TTLCache({ max: 1000 });
  }

  private getKey(str: string): string {
    return this.namespace + "_" + str;
  }

  getGroups(key: string): string[] | null | undefined {
    return this.groupsCache.get(this.getKey(key));
  }

  setGroups(key: string, groups: string[]): void {
    this.groupsCache.set(this.getKey(key), groups);
  }

  setProviderToken(key: string, providerToken: string, ttl?: number) {
    this.providerTokenCache.set(this.getKey(key), providerToken, { ttl });
  }

  getProviderToken(key: string): string | null | undefined {
    return this.providerTokenCache.get(this.getKey(key));
  }
}
