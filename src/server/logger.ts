import type { Logger } from "@verdaccio/types";

import { plugin } from "@/constants";

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
  fatal: noop,
};

let logger: Logger = dummyLogger;

export function setLogger(l?: Logger) {
  if (!l) return;

  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
  logger = l.child({ plugin: { name: plugin.name } });
  logger?.info(plugin, "plugin loading: @{name}@@{version}");
}

export default logger;
