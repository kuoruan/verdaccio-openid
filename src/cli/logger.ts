import { plugin, pluginKey } from "@/constants";
import colors from "picocolors";

const prefix = colors.blue(`[${pluginKey}]`);

const logger = {
  error: (...args: any[]) => console.error(prefix, colors.red(args.join(" "))),
  info: console.log.bind(console, prefix),
  success: (...args: any[]) => console.log(prefix, colors.green(args.join(" "))),
  warn: (...args: any[]) => console.warn(prefix, colors.yellow(args.join(" "))),
};

logger.info(`Version: ${plugin.name}@${plugin.version}`);

export default logger;
