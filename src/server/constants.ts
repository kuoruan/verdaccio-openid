import { fileURLToPath } from "url";

import { pluginKey } from "@/constants";

export const staticPath = `/-/static/${pluginKey}`;
export const publicRoot = fileURLToPath(new URL("../client", import.meta.url));
