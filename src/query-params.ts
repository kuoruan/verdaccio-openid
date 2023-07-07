/**
 * parse a query string into a key/value object
 *
 * @param search the query string to parse
 * @returns a key/value object
 */
export function parseQueryParams(search: string): Record<string, string> {
  if (!search) return {};

  if (search.startsWith("?")) {
    search = search.substring(1);
  }

  return search.split("&").reduce((acc, pair) => {
    const [key, value] = pair.split("=");
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
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
