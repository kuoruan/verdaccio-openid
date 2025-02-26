import { pluginKey } from "@/constants";
import { config } from "dotenv";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { debug } from "./debugger";

const env = config({
  path: [os.homedir(), process.cwd()].flatMap((dir) => [path.join(dir, ".env"), path.join(dir, `.env.${pluginKey}`)]),
});

debug("Loaded environment variables", env.parsed);

/**
 * plugins must be a default export
 */
export { Plugin as default } from "./plugin/Plugin";
