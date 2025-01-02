import { fileURLToPath } from "node:url";

/** @type {import("vitest/node").UserWorkspaceConfig} */
export default {
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.{test,spec}.ts"],
  },
};
