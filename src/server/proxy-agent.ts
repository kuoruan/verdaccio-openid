import type { Config } from "@verdaccio/types";
import { bootstrap } from "global-agent";

import logger from "./logger";

bootstrap({
  environmentVariableNamespace: "",
  socketConnectionTimeout: 60_000,
});

/**
 * Apply Verdaccio's proxy settings to global-agent, which then routes outgoing
 * requests through them.
 *
 * See https://www.npmjs.com/package/global-agent#globalglobal_agent.
 *
 * @param proxyConfig the `http_proxy`, `https_proxy` and `no_proxy` values
 */
export function registerGlobalProxy(proxyConfig: Pick<Config, "http_proxy" | "https_proxy" | "no_proxy">) {
  for (const [key, value] of Object.entries(proxyConfig)) {
    if (!value) {
      continue;
    }

    const proxyAgentEnvKey = key.toUpperCase();

    global.GLOBAL_AGENT[proxyAgentEnvKey] = value;

    logger.info({ key: proxyAgentEnvKey, value }, "setting proxy environment variable: @{key}=@{value}");
  }
}
