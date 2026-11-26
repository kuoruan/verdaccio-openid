/**
 * Normalize a URL prefix so it both starts and ends with "/".
 *
 * Copied from `@verdaccio/url#wrapPrefix`, which can't be imported directly
 * because it's a CommonJS module. Existing slashes are not deduplicated.
 *
 * @param prefix the URL prefix (may omit leading/trailing slashes)
 * @returns the prefix wrapped in slashes, or "" when falsy
 */
function wrapPrefix(prefix: string | void): string {
  if (!prefix) {
    return "";
  }
  const withLeading = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 * Resolve the UI base URL from the global Verdaccio options.
 *
 * Prefers `base` from `__VERDACCIO_BASENAME_UI_OPTIONS`; otherwise constructs it
 * from `location` and the `url_prefix` option.
 *
 * @param shouldStripTrailingSlash whether to strip trailing slashes (default false)
 * @returns the resolved base URL
 */
export function getBaseUrl(shouldStripTrailingSlash = false): string {
  let baseUrl = window.__VERDACCIO_BASENAME_UI_OPTIONS?.base;

  if (!baseUrl) {
    const urlPrefix = window.__VERDACCIO_BASENAME_UI_OPTIONS?.url_prefix;

    baseUrl = `${location.protocol}//${location.host}${wrapPrefix(urlPrefix)}`;
  }

  return shouldStripTrailingSlash ? baseUrl.replace(/\/+$/, "") : baseUrl;
}
