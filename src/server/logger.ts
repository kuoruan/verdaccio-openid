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

  logger = l.child({ plugin: { name: plugin.name } });
  logger?.info(plugin, "plugin loading: @{name}@@{version}");
}

// Use named-export-as-default to create a live binding so that
// `setLogger()` reassignments are visible to every importer.
// `export default logger` would capture the initial dummyLogger
// value and never update.
export { logger as default };
