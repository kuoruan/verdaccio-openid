import { pluginKey } from "@/constants";
import { fileURLToPath } from "node:url";

export const staticPath = `/-/static/${pluginKey}`;
export const publicRoot = fileURLToPath(new URL("../client", import.meta.url));

export const CONFIG_ENV_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
