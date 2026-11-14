/**
 * Parse a query string into a key/value object.
 *
 * @param search the query string to parse
 * @returns a key/value object
 */
export function parseQueryParams(search: string): Record<string, string> {
  const params = {};

  if (!search) return params;

  if (search.startsWith("?")) {
    search = search.slice(1);
  }

  for (const str of search.split("&")) {
    const [key, value] = str.split("=", 2);
    params[key] = decodeURIComponent(value);
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
