/* eslint-disable unicorn/prefer-spread, unicorn/prefer-code-point */

// This parseJWT implementation is taken from https://stackoverflow.com/a/38552302/1935971
export function parseJwt(token: string): Record<string, any> | null {
  // JWT has 3 parts separated by ".", the payload is the base64url-encoded part in the middle
  const base64Url = token.split(".")[1];
  // base64url replaced '+' and '/' with '-' and '_', so we undo it here
  const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/");
  const jsonPayload = decodeURIComponent(
    window
      .atob(base64)
      .split("")
      // atob decoded the base64 string, but multi-byte characters (emojis for example)
      // are not decoded properly. For example, "🍀" looks like "ð\x9F\x8D\x80". The next
      // line converts bytes into URI-percent-encoded format, for example "%20" for space.
      // Lastly, the decodeURIComponent wrapping this can correctly get a UTF-8 string.
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(jsonPayload);
  } catch {
    return null;
  }

  return payload;
}

/**
 * Retry an action multiple times.
 *
 * @param action
 * @param times
 */
export function retry(action: () => void, times = 5): void {
  for (let i = 0; i < times; i++) {
    setTimeout(() => action(), 100 * i);
  }
}

/**
 * Check if the path of a mouse event contains an element.
 *
 * @param selector the selector of the element to check for
 * @param e the mouse event
 * @returns
 */
function pathContainsElement(selector: string, e: MouseEvent): boolean {
  const path = e.path || e.composedPath?.();
  const element = document.querySelector(selector)!;

  return path.includes(element);
}

/**
 * Interrupt a click event on an element.
 *
 * @param selector the selector of the element to interrupt the click event for
 * @param callback new callback to run instead of the original click event
 */
export function interruptClick(selector: string, callback: () => void): void {
  const handleClick = (e: MouseEvent) => {
    if (pathContainsElement(selector, e)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  };
  const capture = true;
  document.addEventListener("click", handleClick, capture);
}

/**
 * Copy from @verdaccio/url#wrapPrefix
 *
 * We can't import it directly because it's a commonjs module.
 *
 * @param prefix
 * @returns
 */
export function wrapPrefix(prefix: string | void): string {
  if (prefix === "" || prefix === undefined || prefix === null) {
    return "";
  } else if (!prefix.startsWith("/") && prefix.endsWith("/")) {
    return `/${prefix}`;
  } else if (!prefix.startsWith("/") && !prefix.endsWith("/")) {
    return `/${prefix}/`;
  } else if (prefix.startsWith("/") && !prefix.endsWith("/")) {
    return `${prefix}/`;
  } else {
    return prefix;
  }
}

/**
 * Get the base url from the global options
 *
 * @param noTrailingSlash Whether to include a trailing slash.
 * @returns
 */
export function getBaseUrl(noTrailingSlash = false): string {
  const urlPrefix = window.__VERDACCIO_BASENAME_UI_OPTIONS?.url_prefix;

  const base = `${location.protocol}//${location.host}${wrapPrefix(urlPrefix)}`;

  return noTrailingSlash ? base.replace(/\/$/, "") : base;
}

/**
 * Copy text to the clipboard.
 *
 * @param text the text to copy to the clipboard
 */
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
