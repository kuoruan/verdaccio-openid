import fs from "node:fs";
import path from "node:path";
import process from "node:process";
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
import { nodeExternals } from "rollup-plugin-node-externals";

const packageName = process.env.npm_package_name;
const packageVersion = process.env.npm_package_version;

function getBasePlugins(isBrowser = false) {
  return [
    nodeExternals({
      deps: !isBrowser,
      devDeps: true,
    }),
    nodeResolve({
      extensions: [".js", ".ts"],
      browser: isBrowser,
    }),
    alias({
      entries: [{ find: "@", replacement: fileURLToPath(new URL("src", import.meta.url)) }],
    }),
    replace({
      preventAssignment: true,
      values: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
        "process.env.npm_package_name": JSON.stringify(packageName),
        "process.env.npm_package_version": JSON.stringify(packageVersion),
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
            corejs: isBrowser ? { version: "3.40", proposals: true } : false,
            browserslistEnv: isBrowser ? "browser" : "node",
          },
        ],
        "@babel/preset-typescript",
      ],
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
      {
        name: "executable",
        writeBundle: (options, output) => {
          for (const bundle of Object.values(output)) {
            if (bundle.isEntry) {
              const filePath = path.join(options.dir, bundle.fileName);
              fs.promises.chmod(filePath, "755");
            }
          }
        },
      },
    ],
  },
  {
    input: "./src/client/verdaccio.ts",
    output: {
      dir: "dist/client",
      entryFileNames: (info) => {
        if (info.isEntry) {
          return `${packageName}-${packageVersion}.js`;
        }

        return "[name].[hash].js";
      },
      format: "iife",
    },
    plugins: [...getBasePlugins(true), terser()],
  },
]);
