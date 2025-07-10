import type {
  AbbreviatedManifest,
  Callback,
  Manifest,
  MergeTags,
  Package,
  StringValue,
  Token,
  TokenFilter,
  Version,
} from "@verdaccio/types";

export {};

declare module "@verdaccio/types" {
  export interface ReadTarball {
    abort: () => void;
  }

  export interface UploadTarball {
    done: () => void;
    abort: () => void;
  }

  // Define callback types for better type safety
  export type AddPackageCallback = (error?: Error | null) => void;

  export type GetPackageCallback = (
    error: Error | null,
    metadata?: AbbreviatedManifest,
    uplinkErrors?: Error[],
  ) => void;

  // Define options interface for getPackage method
  export interface GetPackageOptions {
    /** Package Name */
    name: string;
    /** Express `req` object */
    req: any;
    /** keep up link info in package meta, last update, etc. */
    keepUpLinkData?: boolean;
    /** whether to look for uplink packages */
    uplinksLook?: boolean;
    abbreviated?: boolean;
    /** Callback for receive data */
    callback: GetPackageCallback;
  }

  export interface SearchOptions {
    req: any;
  }

  /**
   * Storage class for managing package data, metadata, and interactions
   * with both local storage and remote uplinks in Verdaccio
   */
  export interface Storage {
    /**
     * Add a new package to the system
     * Checks if package with the same name is available from uplinks.
     * If it isn't, creates package locally
     * @param name - Package name
     * @param metadata - Package metadata
     * @param callback - Callback function for handling result
     * @returns Promise that resolves when package is added
     */
    addPackage(name: string, metadata: Manifest, callback: AddPackageCallback): Promise<void>;

    /**
     * Read tokens based on filter criteria
     * @param filter - Token filter criteria
     * @returns Promise that resolves to array of tokens
     */
    readTokens(filter: TokenFilter): Promise<Token[]>;

    /**
     * Save a token to storage
     * @param token - Token object to save
     * @returns Promise that resolves when token is saved
     */
    saveToken(token: Token): Promise<void>;

    /**
     * Delete a specific token for a user
     * @param user - Username
     * @param tokenKey - Token key to delete
     * @returns Promise that resolves when token is deleted
     */
    deleteToken(user: string, tokenKey: string): Promise<any>;

    /**
     * Add a new version of an existing package
     *
     * @param name - Package name
     * @param version - Version string
     * @param metadata - Version metadata
     * @param tag - Tag value
     * @param callback - Callback function for handling result
     */
    addVersion(name: string, version: string, metadata: Version, tag: StringValue, callback: Callback): void;

    /**
     * Tag a package version with provided tag
     *
     * @param name - Package name
     * @param tagHash - Tag hash object
     * @param callback - Callback function for handling result
     */
    mergeTags(name: string, tagHash: MergeTags, callback: Callback): void;

    /**
     * Change an existing package (e.g., unpublish one version)
     * Changes package info from local storage and all uplinks with write access
     * @param name - Package name
     * @param metadata - Updated package metadata
     * @param revision - Revision string
     * @param callback - Callback function for handling result
     */
    changePackage(name: string, metadata: Package, revision: string, callback: Callback): void;

    /**
     * Remove a package from the system
     * Removes package from local storage
     * @param name - Package name
     * @param callback - Callback function for handling result
     */
    removePackage(name: string, callback: Callback): void;

    /**
     * Remove a tarball from the system
     * Removes tarball from local storage. Tarball should not be linked
     * to any existing versions (package version should be unpublished first)
     * @param name - Package name
     * @param filename - Tarball filename
     * @param revision - Revision string
     * @param callback - Callback function for handling result
     */
    removeTarball(name: string, filename: string, revision: string, callback: Callback): void;

    /**
     * Upload a tarball for a package
     * Synchronous function that returns a WritableStream
     * @param name - Package name
     * @param filename - Tarball filename
     * @returns UploadTarball stream for writing tarball data
     */
    addTarball(name: string, filename: string): UploadTarball;

    /**
     * Check if a tarball exists locally
     * @param name - Package name
     * @param filename - Tarball filename
     * @returns Promise that resolves to boolean indicating existence
     */
    hasLocalTarball(name: string, filename: string): Promise<boolean>;

    /**
     * Get a tarball from storage
     * Synchronous function that returns a ReadableStream
     * Tries to read tarball locally first, then from uplinks
     * @param name - Package name
     * @param filename - Tarball filename
     * @returns ReadTarball stream for reading tarball data
     */
    getTarball(name: string, filename: string): ReadTarball;

    /**
     * Retrieve package metadata
     * Combines results from localStorage.getPackage and uplink.get_package
     * for every uplink with proxy_access rights
     * @param options - Options object containing package name, request, flags and callback
     */
    getPackage(options: GetPackageOptions): void;

    /**
     * Retrieve remote and local packages more recent than startkey
     * Streams all packages from uplinks first, then local packages
     * @param startkey - Starting key for search
     * @param options - Search options
     * @returns Stream of package data
     */
    search(startkey: string, options: SearchOptions): any;

    /**
     * Retrieve only private local packages
     * @param callback - Callback function for handling result
     */
    getLocalDatabase(callback: Callback): void;
  }
}
