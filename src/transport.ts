import { EnvHttpProxyAgent } from "undici";

import type { ProxyConfig } from "@/utils";

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

/**
 * Create a fetch bound to the given proxy configuration.
 *
 * An invalid proxy URL fails here, never as a silent direct connection. Pass
 * `resolveProxyConfig`'s output so the agent and the log see the same values.
 *
 * @param resolved the resolved proxy values, if any
 * @returns a fetch with proxy routing plus a close for its connections
 */
export function createTransport(resolved: ProxyConfig = {}): ProxiedTransport {
  const agent = new EnvHttpProxyAgent({
    httpProxy: resolved.http_proxy,
    httpsProxy: resolved.https_proxy,
    noProxy: resolved.no_proxy,
  });

  // `dispatcher` belongs to undici's RequestInit, not the global fetch type,
  // so the asserted value stops at this line and callers keep the global type.
  const fetchWithProxy: typeof fetch = (input, init) =>
    fetch(input, { ...init, dispatcher: agent } as unknown as RequestInit);

  return { fetch: fetchWithProxy, close: () => agent.close() };
}
