import { bootstrap } from "global-agent";

import logger from "./logger";

declare const GLOBAL_AGENT: Record<"HTTP_PROXY" | "HTTPS_PROXY" | "NO_PROXY", string>;

export function registerGlobalProxyAgent() {
  bootstrap({
    environmentVariableNamespace: "",
  });

  const config = JSON.stringify(GLOBAL_AGENT || {});
  logger.info({ config }, "using proxy config: @{config}");
}
