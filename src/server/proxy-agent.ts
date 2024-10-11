import type { Config } from "@verdaccio/types";
import { bootstrap } from "global-agent";

import logger from "./logger";

bootstrap({
  environmentVariableNamespace: "",
  socketConnectionTimeout: 10_000,
});

/**
 * Set global proxy configuration.
 *
 * https://www.npmjs.com/package/global-agent#globalglobal_agent
 *
 * @param proxyConfig - proxy configuration
 */
export function registerGlobalProxy(proxyConfig: Pick<Config, "http_proxy" | "https_proxy" | "no_proxy">) {
  for (const [key, value] of Object.entries(proxyConfig)) {
    if (value) {
      const proxyAgentEnvKey = key.toUpperCase();

      global.GLOBAL_AGENT[proxyAgentEnvKey] = value;

      logger.info({ key: proxyAgentEnvKey, value }, "setting proxy environment variable: @{key}=@{value}");
    }
  }
}
