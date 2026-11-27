import open from "open";

import {
  CLI_CLOSE_TIMEOUT_MS,
  CLI_OPEN_BROWSER_TIMEOUT_MS,
  CLI_TIMEOUT_MS,
  CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS,
  CLI_WEB_LOGIN_POLL_INTERVAL_MS,
} from "@/cli/constants";
import { AUTH_TOKEN_REGEX, npmLoginPath } from "@/constants";
import { abortAfter, sleep, startDelay } from "@/timers";
import { createTransport } from "@/transport";
import { isNull, isPlainObject, describeProxyConfig, resolveProxyConfig } from "@/utils";

import logger from "./logger";

export interface WebLoginOptions {
  /**
   * Total time for the whole login before giving up. Defaults to `CLI_TIMEOUT_MS`.
   * Opening the browser has a shorter bound, within the overall deadline;
   * if the launcher hangs, the login keeps polling.
   */
  timeoutMs?: number;
  /**
   * Whether to honor the proxy settings. Defaults to `true`; `false` connects
   * directly and never reads them.
   */
  useProxy?: boolean;
  /**
   * Defaults to `true`. Set to `false` to skip security checks on `loginUrl`
   * and `doneUrl`; both URLs must still be parseable.
   */
  validateUrls?: boolean;
}

/**
 * Log in through npm's own web protocol, so the CLI never receives a token
 * over an unauthenticated local callback server.
 *
 * The CLI obtains the token by polling `doneUrl`, so by default both transaction URLs
 * must use HTTP(S), stay on the registry origin within its path prefix, and
 * carry no credentials. `validateUrls: false` drops these checks. CLI login
 * requests do not follow redirects.
 *
 * @param registry the registry URL the user configured, without a trailing slash
 * @param options login options; see `WebLoginOptions`
 * @returns the npm token the server hands out
 */
export async function webLogin(registry: string, options: WebLoginOptions = {}): Promise<string> {
  const { timeoutMs = CLI_TIMEOUT_MS, validateUrls, useProxy } = options;
  const shouldValidateUrls = validateUrls !== false;

  const transport = createLoginTransport(useProxy !== false);

  if (!shouldValidateUrls) {
    logger.warn("Unsafe URL checks disabled: login and token URLs are not restricted to the registry.");
  }

  const { signal, cancel } = abortAfter(timeoutMs);

  try {
    const { login, done } = await startLogin(registry, {
      customFetch: transport.fetch,
      signal,
      validateUrls: shouldValidateUrls,
    });
    await openLoginPage(login, signal);

    return await pollLogin(done, transport.fetch, signal);
  } catch (error) {
    if (signal.aborted) {
      throw new Error("The login timed out.");
    }

    throw error;
  } finally {
    cancel();
    // The login owns its transport, so only a bounded wait: a hung proxy
    // connection must not hold the CLI past the login's own deadline.
    // A failing cleanup must not replace the token or the original error.
    const linger = startDelay(CLI_CLOSE_TIMEOUT_MS);

    try {
      await Promise.race([transport.close(), linger.finished]);
    } catch {
      // Cleanup failure stays silent: the login result wins.
    } finally {
      linger.cancel();
    }
  }
}

/**
 * Create the transport for this login.
 *
 * With proxies disabled, connect directly and never read the proxy settings.
 * Otherwise resolve them once, then use that result for the agent and for the
 * proxy log line, whose credentials are hidden.
 *
 * @param useProxy whether to honor the proxy settings
 * @returns the transport for this login, which the caller closes
 */
function createLoginTransport(useProxy: boolean) {
  if (!useProxy) return createTransport(false);

  const config = resolveProxyConfig();
  const transport = createTransport(config);
  const proxies = describeProxyConfig(config);
  if (proxies) {
    logger.info("Using proxies:", JSON.stringify(proxies));
  }
  return transport;
}

/** Options for starting an npm Web login. */
interface StartLoginOptions {
  /** Fetch through the transport owned by this login. */
  customFetch: typeof fetch;
  /** Aborted when the overall login deadline expires. */
  signal: AbortSignal;
  /** When false, skip URL security checks; both URLs must still be parseable. */
  validateUrls: boolean;
}

/**
 * Send the login request without following redirects, then resolve both
 * transaction URLs and, when validation is enabled, check them against the
 * registry.
 *
 * @param registry the registry URL the user configured
 * @param options the request transport, timeout signal, and URL validation setting
 * @returns the normalized login and done URLs
 */
async function startLogin(
  registry: string,
  { customFetch, signal, validateUrls }: StartLoginOptions,
): Promise<{ login: URL; done: URL }> {
  const registryUrl = new URL(registry);
  const start = await customFetch(registry + npmLoginPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    redirect: "manual",
    signal,
  });

  if (start.status !== 200) {
    discardBody(start);

    throw new Error(`login request failed with status ${String(start.status)}`);
  }

  const started = await readJsonObject(start, "login request returned an unexpected response");
  const { loginUrl, doneUrl } = started;

  if (typeof loginUrl !== "string" || typeof doneUrl !== "string") {
    throw new Error("login request returned an unexpected response");
  }

  const login = resolveUrl(loginUrl, registryUrl);
  const done = resolveUrl(doneUrl, registryUrl);

  if (validateUrls) {
    validateUrl(login, registryUrl);
    validateUrl(done, registryUrl);
  }

  return { login, done };
}

/**
 * Show the login URL and open it in the browser.
 *
 * A failed or timed-out launch is not fatal: the URL is already printed, so
 * the login keeps polling while the user opens it by hand.
 *
 * @param login the normalized login URL
 * @param signal aborts the wait when the login or browser deadline fires
 */
async function openLoginPage(login: URL, signal: AbortSignal): Promise<void> {
  // Print before opening the browser, so a slow or absent launcher still leaves a usable link.
  logger.info("If the browser does not open, visit this URL:");
  logger.info(login.href);

  const openDeadline = abortAfter(CLI_OPEN_BROWSER_TIMEOUT_MS);

  try {
    await openBrowser(login.href, AbortSignal.any([signal, openDeadline.signal]));
  } catch (error) {
    if (signal.aborted) throw error;

    logger.error("Could not open a browser. Open this URL to log in:");
    logger.info(login.href);
  } finally {
    openDeadline.cancel();
  }
}

/**
 * Poll the done URL until the server hands out the token.
 *
 * @param done the normalized done URL
 * @param fetchImpl the fetch to poll with
 * @param signal aborts the wait when the login times out
 * @returns the npm token the server hands out
 */
async function pollLogin(done: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<string> {
  let waitMs = CLI_WEB_LOGIN_POLL_INTERVAL_MS;

  for (;;) {
    await sleep(waitMs, signal);

    const poll = await fetchImpl(done.href, { redirect: "manual", signal });

    switch (poll.status) {
      case 202: {
        discardBody(poll);
        waitMs = retryAfterMs(poll.headers.get("retry-after"));
        continue;
      }

      case 200: {
        const completed = await readJsonObject(poll, "login completed with an unexpected response");
        const { token } = completed;

        if (typeof token !== "string" || !AUTH_TOKEN_REGEX.test(token)) {
          throw new Error("login completed with an unexpected response");
        }

        return token;
      }

      case 401: {
        discardBody(poll);

        throw new Error("login expired or was rejected");
      }

      default: {
        const status = poll.status;
        discardBody(poll);

        throw new Error(`login polling failed with status ${String(status)}`);
      }
    }
  }
}

/**
 * Drop a response body this code will not read.
 *
 * Cancelling returns a promise, and a rejected cancellation must not turn into
 * an unhandled rejection in the CLI.
 *
 * @param response the response whose body is dropped
 */
function discardBody(response: Response): void {
  response.body?.cancel().catch(() => {});
}

/**
 * Read the JSON body of a response as an object.
 *
 * A body that is not an object (including `null`, an array and a scalar) is
 * rejected with the message the caller gives, so the protocol never reads a
 * field from a shape it does not understand.
 *
 * @param response the response to read
 * @param unexpected the message for anything that is not an object
 * @returns the body as a plain object
 */
async function readJsonObject(response: Response, unexpected: string): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();

  if (!isPlainObject(body)) {
    throw new Error(unexpected);
  }

  return body;
}

/**
 * Resolve a transaction URL against the registry.
 *
 * @param raw the URL the server returned
 * @param registryUrl the parsed registry URL
 * @returns the parsed and normalized URL
 */
function resolveUrl(raw: string, registryUrl: URL): URL {
  try {
    return new URL(raw, registryUrl.href);
  } catch {
    throw new Error("login request returned an invalid URL");
  }
}

/** Require HTTP(S), the registry origin and path prefix, and no credentials. */
function validateUrl(parsed: URL, registryUrl: URL): void {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("login request returned a URL with an unexpected protocol");
  }

  if (parsed.username || parsed.password) {
    throw new Error("login request returned a URL with credentials");
  }

  if (parsed.origin !== registryUrl.origin) {
    throw new Error("login request returned a URL on another origin");
  }

  const prefix = registryUrl.pathname.endsWith("/") ? registryUrl.pathname : `${registryUrl.pathname}/`;

  if (!parsed.pathname.startsWith(prefix) && parsed.pathname !== registryUrl.pathname) {
    throw new Error("login request returned a URL outside the registry");
  }
}

/**
 * Ask the OS to open the browser at the transaction URL.
 *
 * `open` cannot be cancelled: an abort only ends this wait, the browser
 * itself keeps opening. The timeout lives in the signal handed in.
 *
 * @param url the transaction URL to open
 * @param signal settles this wait early when the login or browser deadline fires
 */
function openBrowser(url: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    void open(url).then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function retryAfterMs(value: string | null): number {
  const seconds = isNull(value) ? Number.NaN : Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) return CLI_WEB_LOGIN_POLL_INTERVAL_MS;

  return Math.min(Math.max(seconds * 1_000, 1_000), CLI_WEB_LOGIN_MAX_POLL_INTERVAL_MS);
}
