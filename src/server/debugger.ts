import buildDebug from "debug";

import { pluginKey } from "@/constants";

export const debug = buildDebug(`verdaccio:plugin:${pluginKey}`);
