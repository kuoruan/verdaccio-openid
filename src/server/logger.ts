import type { Logger } from "@verdaccio/types";
import buildDebug from "debug";

import { plugin, pluginKey } from "@/constants";

function noop() {
  /* noop */
}

const dummyLogger: Logger = {
  child: () => dummyLogger,
  debug: noop,
  error: noop,
  http: noop,
  trace: noop,
  warn: noop,
  info: noop,
};

let logger: Logger = dummyLogger;

export function setLogger(l: Logger) {
  logger = l.child({ plugin: { name: plugin.name } });
  logger?.info(plugin, "plugin loading: @{name}@@{version}");
}

export default logger;

export const debug = buildDebug(`verdaccio:plugin:${pluginKey}`);
