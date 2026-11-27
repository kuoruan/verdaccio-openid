import { fileURLToPath } from "node:url";

/** @type {import("vitest/node").UserWorkspaceConfig} */
export default {
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
      "@root": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.{test,spec}.ts"],
    // Load CSS instead of empty strings; module IDs include the `?inline` query.
    css: { include: [/\.css/] },
  },
};
