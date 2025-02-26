import { pluginKey } from "@/constants";
import buildDebug from "debug";

export const debug = buildDebug(`verdaccio:plugin:${pluginKey}`);
