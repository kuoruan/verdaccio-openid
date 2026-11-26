import { EnvHttpProxyAgent } from "undici";

/** The three proxy knobs Verdaccio exposes, plus the environment fallback. */
export interface ProxyConfig {
  http_proxy?: string;
  https_proxy?: string;
  no_proxy?: string;
}

/**
 * A fetch bound to one proxy configuration, plus a close for its connections.
 *
 * One instance serves every request of one plugin instance or one CLI
 * login; close it when its owner is done.
 */
export interface ProxiedTransport {
  fetch: typeof fetch;
  close: () => Promise<void>;
}

/** Verdaccio treats an empty proxy value as unset; match that here. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

/**
 * Create a fetch bound to the given proxy configuration.
 *
 * Each field prefers the explicit value (Verdaccio's config on the server,
 * unset on the CLI), then the lowercase environment variable, then the
 * uppercase one — the same order curl and undici use. An invalid proxy URL
 * fails here, never as a silent direct connection.
 *
 * @param config the explicit proxy values, if any
 * @returns a fetch with proxy routing plus a close for its connections
 */
export function createTransport(config: ProxyConfig = {}): ProxiedTransport {
  // Only non-empty values are passed so blanks count as unset instead of
  // failing URL parsing; the environment fallback stays lowercase-first.
  const agent = new EnvHttpProxyAgent({
    httpProxy: nonEmpty(config.http_proxy),
    httpsProxy: nonEmpty(config.https_proxy),
    noProxy: nonEmpty(config.no_proxy),
  });

  // The bridge is this dispatcher-carrying init alone: the global fetch
  // type has no such member, so the object goes through `unknown` once.
  // The fetch itself and everything the callers see stay on the global
  // type — nothing else is asserted, and no `any` is used.
  const fetchWithProxy: typeof fetch = (input, init) =>
    fetch(input, { ...init, dispatcher: agent } as unknown as RequestInit);

  return { fetch: fetchWithProxy, close: () => agent.close() };
}
