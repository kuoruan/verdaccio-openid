/* eslint-disable unicorn/prefer-code-point */

// This parseJwt implementation is taken from https://stackoverflow.com/a/38552302/1935971
export function parseJwt(token: string): Record<string, any> | null {
  try {
    // JWT has 3 parts separated by ".", the payload is the base64url-encoded part in the middle
    const parts = token.split(".");
    if (parts.length < 3) return null;

    const base64Url = parts[1];
    if (!base64Url) return null;

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

    return JSON.parse(jsonPayload) as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Schedule an action `times` times via `setTimeout`, each `100 * i` ms apart.
 *
 * All calls fire unconditionally — this does not stop on success or failure.
 *
 * @param action the action to schedule
 * @param times number of scheduled calls (default 5)
 */
export function retry(action: () => void, times = 5): void {
  for (let i = 0; i < times; i++) {
    setTimeout(() => action(), 100 * i);
  }
}

/**
 * Check whether the element matching `selector` is in the mouse event's path.
 *
 * @param selector the selector of the element to check for
 * @param e the mouse event
 * @returns whether the matched element appears in the event's composed path
 */
function hasElementInPath(selector: string, e: MouseEvent): boolean {
  const path = e.path || e.composedPath?.();
  const element = document.querySelector(selector)!;

  return path.includes(element);
}

/**
 * Intercept clicks on the element matching `selector` and run `callback` instead.
 *
 * Registers a capture-phase listener on `document`, so it runs before the target's
 * own click handlers and calls `preventDefault`/`stopPropagation` on matching events.
 *
 * @param selector the selector of the element whose clicks to intercept
 * @param callback callback to run instead of the original click
 */
export function interruptClick(selector: string, callback: () => void): void {
  const handleClick = (e: MouseEvent) => {
    if (!hasElementInPath(selector, e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    callback();
  };
  const isCapture = true;
  document.addEventListener("click", handleClick, isCapture);
}

/**
 * Normalize a URL prefix so it both starts and ends with "/".
 *
 * Copied from `@verdaccio/url#wrapPrefix`, which can't be imported directly
 * because it's a CommonJS module. Existing slashes are not deduplicated.
 *
 * @param prefix the URL prefix (may omit leading/trailing slashes)
 * @returns the prefix wrapped in slashes, or "" when falsy
 */
export function wrapPrefix(prefix: string | void): string {
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
 * @param shouldStripTrailingSlash whether to strip a trailing "/" (default false)
 * @returns the resolved base URL
 */
export function getBaseUrl(shouldStripTrailingSlash = false): string {
  let baseUrl = window.__VERDACCIO_BASENAME_UI_OPTIONS?.base;

  if (!baseUrl) {
    const urlPrefix = window.__VERDACCIO_BASENAME_UI_OPTIONS?.url_prefix;

    baseUrl = `${location.protocol}//${location.host}${wrapPrefix(urlPrefix)}`;
  }

  return shouldStripTrailingSlash ? baseUrl.replace(/\/$/, "") : baseUrl;
}

/**
 * Copy text to the clipboard.
 *
 * @param text the text to copy to the clipboard
 */
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
