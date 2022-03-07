import { Logger } from "@verdaccio/types";

import { plugin } from "./constants";

let logger: Logger | null = null;

export function setLogger(l: Logger) {
  logger = l.child({ plugin: { name: plugin.name } });
  logger?.info(plugin, "Version: @{name}@@{version}");
}

const loggerHelper: Logger = {
  child: (...args) => (logger ? logger.child(...args) : loggerHelper),
  debug: (...args) =>
    logger
      ? logger.debug(...args)
      : () => {
          /* noop */
        },
  error: (...args) =>
    logger
      ? logger.error(...args)
      : () => {
          /* noop */
        },
  http: (...args) =>
    logger
      ? logger.http(...args)
      : () => {
          /* noop */
        },
  trace: (...args) =>
    logger
      ? logger.trace(...args)
      : () => {
          /* noop */
        },
  warn: (...args) =>
    logger
      ? logger.warn(...args)
      : () => {
          /* noop */
        },
  info: (...args) =>
    logger
      ? logger.info(...args)
      : () => {
          /* noop */
        },
};

export default loggerHelper;
