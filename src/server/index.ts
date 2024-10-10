import { config } from "dotenv";

config();

// plugins must be a default export
export { Plugin as default } from "./plugin/Plugin";
