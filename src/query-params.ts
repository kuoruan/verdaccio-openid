/**
 * Parse a query string into a key/value object.
 *
 * A pair whose escape sequence is malformed is skipped: the login redirect is
 * the first thing the client reads, and one broken `%` must not stop the rest
 * of the plugin from running.
 *
 * @param search the query string to parse
 * @returns a key/value object
 */
export function parseQueryParams(search: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (!search) return params;

  const query = search.startsWith("?") ? search.slice(1) : search;

  for (const pair of query.split("&")) {
    if (!pair) continue;

    const separator = pair.indexOf("=");
    const key = separator === -1 ? pair : pair.slice(0, separator);
    const value = separator === -1 ? "" : pair.slice(separator + 1);

    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      // Skip the pair; the caller decides what a missing key means.
    }
  }

  return params;
}

/**
 * Serialize a key/value object as a query string, with both sides encoded.
 *
 * @param params the key/value object to serialize
 * @returns the query string, without a leading "?"
 */
export function stringifyQueryParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}
