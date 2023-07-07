declare module "@isaacs/ttlcache" {
  export default class TTLCache<T> {
    constructor(options: { ttl: number });
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): void;
    clear(): void;
    get size(): number;

    *keys(): string[];
    *values(): T[];
    *entries(): [string, T][];
  }
}
