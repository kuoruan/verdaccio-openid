import dotenv from "dotenv";

dotenv.config();

// plugins must be a default export
export { Plugin as default } from "./plugin/Plugin";
