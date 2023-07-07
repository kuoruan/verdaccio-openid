import { plugin, pluginKey } from "./constants";

export const logger = {
  log: console.log.bind(console, pluginKey),
  error: (...args: any[]) => console.error(pluginKey, args.join(" ")),
};

logger.log(`Version: ${plugin.name}@${plugin.version}`);
