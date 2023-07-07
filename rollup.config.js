import path from "path";

import alias from "@rollup/plugin-alias";
import { babel } from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { defineConfig } from "rollup";
import { externals } from "rollup-plugin-node-externals";
import { terser } from "rollup-plugin-terser";

import pkg from "./package.json";

const basePlugins = [
  alias({
    entries: [{ find: "@", replacement: path.resolve(__dirname, "src") }],
  }),
  json(),
  commonjs(),
  babel({ babelHelpers: "bundled", extensions: [".js", ".ts"] }),
  terser(),
];

export default defineConfig([
  {
    input: "src/server/index.ts",
    output: [
      {
        file: pkg.main,
        exports: "auto",
        format: "cjs",
      },
      {
        file: pkg.module,
        format: "es",
      },
    ],
    plugins: [
      externals(),
      nodeResolve({
        extensions: [".js", ".ts"],
      }),
      ...basePlugins,
    ],
  },
  {
    input: "src/cli/index.ts",
    output: {
      file: Object.values(pkg.bin)[0],
      exports: "auto",
      format: "cjs",
    },
    plugins: [
      externals(),
      nodeResolve({
        extensions: [".js", ".ts"],
      }),
      ...basePlugins,
    ],
  },
  {
    input: "src/client/verdaccio-5.ts",
    output: {
      file: "dist/client/verdaccio-5.js",
      format: "iife",
    },
    plugins: [
      externals({
        deps: false,
        devDeps: true,
      }),
      nodeResolve({
        extensions: [".js", ".ts"],
        browser: true,
      }),
      ...basePlugins,
    ],
  },
]);
