import { bootstrap } from "global-agent";

import logger from "./logger";

bootstrap({
  environmentVariableNamespace: "",
});

export function registerGlobalProxy(
  proxyConfig: Record<"http_proxy" | "https_proxy" | "no_proxy", string | undefined>,
) {
  for (const [key, value] of Object.entries(proxyConfig)) {
    if (value) {
      global.GLOBAL_AGENT[key.toUpperCase()] = value;
    }
  }

  const config = JSON.stringify(global.GLOBAL_AGENT || {});
  logger.info({ config }, "using proxy config: @{config}");
}
