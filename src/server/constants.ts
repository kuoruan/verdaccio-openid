import { pluginKey } from "../constants";

export const staticPath = `/-/static/${pluginKey}`;
export const publicRoot = new URL("../client", import.meta.url).pathname;
