import path from "path";

import alias from "@rollup/plugin-alias";
import { babel } from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import image from "@rollup/plugin-image";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { defineConfig } from "rollup";
import { externals } from "rollup-plugin-node-externals";
import { terser } from "rollup-plugin-terser";

import pkg from "./package.json";

function getPlugins(isBrowser = false) {
  return [
    externals({
      deps: !isBrowser,
      devDeps: true,
    }),
    nodeResolve({
      extensions: [".js", ".ts"],
      browser: isBrowser,
    }),
    alias({
      entries: [{ find: "@", replacement: path.resolve(__dirname, "src") }],
    }),
    json(),
    image(),
    commonjs(),
    babel({
      babelHelpers: "bundled",
      extensions: [".js", ".ts"],
      presets: [
        [
          "@babel/preset-env",
          {
            useBuiltIns: isBrowser ? "usage" : false,
            corejs: isBrowser ? "3" : false,
            targets: isBrowser ? pkg.browserslist : { node: "current" },
          },
        ],
        "@babel/preset-typescript",
      ],
      exclude: [/core-js/],
    }),
    isBrowser && terser(),
  ].filter(Boolean);
}

export default defineConfig([
  {
    input: "src/server/index.ts",
    output: [
      {
        file: pkg.main,
        exports: "named", // change to "default" or "auto" will cause verdaccio error
        format: "cjs",
      },
      {
        file: pkg.module,
        format: "es",
      },
    ],
    plugins: getPlugins(),
  },
  {
    input: "src/cli/index.ts",
    output: {
      file: Object.values(pkg.bin)[0],
      format: "cjs",
    },
    plugins: getPlugins(),
  },
  {
    input: "src/client/verdaccio-6.ts",
    output: {
      file: "dist/client/verdaccio-6.js",
      format: "iife",
    },
    plugins: getPlugins(true),
  },
]);
