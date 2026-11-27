/**
 * Helpers for the plugin layer: the ones that read Verdaccio types or an
 * Express request.
 */
import { stripTrailingSlashes } from "@/utils";
import type { AllowAccess, PackageList } from "@verdaccio/types";
import { getPublicUrl } from "@verdaccio/url";
import type { Request } from "express";

/**
 * Collect every permission group named in the Verdaccio package config.
 *
 * @param packages The package list.
 * @returns The configured groups.
 */
export function getAllConfiguredGroups(packages: PackageList = {}): string[] {
  const groups = Object.values(packages).flatMap((packageConfig) => {
    return (["access", "publish", "unpublish"] as const)
      .flatMap((key) => {
        const v = packageConfig[key];

        if (typeof v === "string") {
          return [v];
        }
        if (Array.isArray(v)) {
          return v;
        }
        return [];
      })
      .filter(Boolean);
  });

  return [...new Set(groups)];
}

/**
 * Normalize `authorized-groups` into the form the auth checks use.
 *
 * @param val the `authorized-groups` value: boolean, single group, or list
 * @returns the groups to require, or a boolean when the config asks for no or any group
 */
export function getAuthenticatedGroups(val?: unknown): string[] | boolean {
  switch (typeof val) {
    case "boolean": {
      return val;
    }
    case "string": {
      return [val].filter(Boolean);
    }
    case "object": {
      return Array.isArray(val) ? val.filter(Boolean) : false;
    }
    default: {
      return false;
    }
  }
}

/**
 * Check whether the current time is before an expiry timestamp.
 *
 * @param expireAt the expiry as seconds since the epoch
 * @returns whether now is still before it
 */
export function isNowBefore(expireAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now < expireAt;
}

/**
 * Get the base url from the request
 *
 * @param urlPrefix The url prefix.
 * @param req The request.
 * @param noTrailingSlash whether to strip the trailing slash
 * @returns the base URL, with a trailing slash unless `noTrailingSlash` is set
 */
export function getBaseUrl(urlPrefix: string, req: Request, noTrailingSlash = false): string {
  const base = getPublicUrl(urlPrefix, req);

  return noTrailingSlash ? stripTrailingSlashes(base) : base;
}

/**
 * Construct the full absolute URL for the current request, correctly handling
 * the url_prefix regardless of whether a reverse proxy strips it from req.url.
 *
 * When a reverse proxy (e.g. nginx) strips the url_prefix from the path, req.url
 * does not contain it — we concatenate baseUrl + req.url to add it back. When no
 * proxy is present, req.url already includes the prefix — we use `new URL(path, base)`
 * resolution to avoid duplicating it.
 *
 * @param urlPrefix The url prefix.
 * @param req The request.
 * @returns The full absolute URL of the current request.
 */
export function getFullUrl(urlPrefix: string, req: Request): URL {
  const baseUrl = getBaseUrl(urlPrefix, req, true);
  const reqPath = req.url;

  // Normalize the prefix (strip trailing slashes) to avoid two edge cases:
  // 1. `/prefix/` does not match `reqPath = "/prefix"` (trailing slash mismatch)
  // 2. `/prefix` incorrectly matches `reqPath = "/prefix-other"` (substring match)
  const cleanPrefix = stripTrailingSlashes(urlPrefix);

  const hasPrefix = !!(cleanPrefix && (reqPath === cleanPrefix || reqPath.startsWith(cleanPrefix + "/")));

  return hasPrefix ? new URL(reqPath, baseUrl) : new URL(baseUrl + reqPath);
}

/**
 * Build the specifier npm uses for a package: `name@version`, `name@tag`, or just the name.
 *
 * @param pkg the package asked for
 * @returns the specifier in the form npm expects
 */
export function getPackageSpec(pkg: AllowAccess): string {
  if (pkg.version) {
    return `${pkg.name}@${pkg.version}`;
  }

  if (pkg.tag) {
    return `${pkg.name}@${pkg.tag}`;
  }

  return pkg.name;
}
