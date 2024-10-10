import colors from "picocolors";

import { plugin, pluginKey } from "@/constants";

const prefix = colors.blue(`[${pluginKey}]`);

const logger = {
  info: console.log.bind(console, prefix),
  warn: (...args: any[]) => console.warn(prefix, colors.yellow(args.join(" "))),
  error: (...args: any[]) => console.error(prefix, colors.red(args.join(" "))),
};

logger.info(`Version: ${plugin.name}@${plugin.version}`);

export default logger;
