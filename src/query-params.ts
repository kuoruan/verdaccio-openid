/**
 * parse a query string into a key/value object
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
    const [key, value] = str.split("=");
    params[key] = decodeURIComponent(value);
  }

  return params;
}

/**
 * stringify a key/value object into a query string
 *
 * @param params the key/value object to stringify
 * @returns stringified query string
 */
export function stringifyQueryParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}
