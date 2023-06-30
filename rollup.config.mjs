import path from "node:path";
import { fileURLToPath } from "node:url";

import alias from "@rollup/plugin-alias";
import { babel } from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import image from "@rollup/plugin-image";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { defineConfig } from "rollup";
import { externals } from "rollup-plugin-node-externals";
import shebang from "rollup-plugin-shebang-bin";

function getBasePlugins(isBrowser = false) {
  const basePath = path.dirname(fileURLToPath(import.meta.url));
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
      entries: [{ find: "@", replacement: path.resolve(basePath, "src") }],
    }),
    replace({
      preventAssignment: true,
      values: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
        "process.env.npm_package_name": JSON.stringify(process.env.npm_package_name),
        "process.env.npm_package_version": JSON.stringify(process.env.npm_package_version),
      },
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
            corejs: isBrowser ? "3.27" : false,
            // set to undefined to use the default browserslist config
            targets: isBrowser ? undefined : { node: "current" },
            ignoreBrowserslistConfig: !isBrowser,
          },
        ],
        "@babel/preset-typescript",
      ],
      exclude: [/core-js/],
    }),
  ].filter(Boolean);
}

export default defineConfig([
  {
    input: "./src/server/index.ts",
    output: [
      {
        dir: "dist/server",
        entryFileNames: "[name].js",
        exports: "named", // change to "default" or "auto" will cause verdaccio error
        format: "cjs",
      },
      {
        dir: "dist/server",
        entryFileNames: "[name].mjs",
        format: "es",
      },
    ],
    plugins: getBasePlugins(),
  },
  {
    input: "./src/cli/index.ts",
    output: {
      dir: "dist",
      entryFileNames: `${process.env.npm_package_name}.mjs`,
      format: "es",
    },
    plugins: [
      ...getBasePlugins(),
      shebang({
        include: ["**/*.js", "**/*.ts"],
        executable: true,
      }),
    ],
  },
  {
    input: "./src/client/verdaccio.ts",
    output: {
      dir: "dist/client",
      entryFileNames: "[name].[hash].js",
      format: "iife",
    },
    plugins: [...getBasePlugins(true), terser()],
  },
]);
