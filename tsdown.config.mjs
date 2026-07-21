import fs from "node:fs";
import process from "node:process";

import { defineConfig } from "tsdown";

const packageName = process.env.npm_package_name;
const packageVersion = process.env.npm_package_version;

const define = {
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  "process.env.npm_package_name": JSON.stringify(packageName || ""),
  "process.env.npm_package_version": JSON.stringify(packageVersion || ""),
};

function svgPlugin() {
  return {
    name: "svg",
    load: {
      filter: { id: /\.svg(\?raw)?$/ },
      handler(id) {
        if (id.endsWith("?raw")) {
          const filePath = id.slice(0, -4);
          const code = fs.readFileSync(filePath, "utf8");
          return `export default ${JSON.stringify(code)}`;
        }

        if (!id.endsWith(".svg")) return null;

        const code = fs.readFileSync(id, "utf8");
        const base64 = Buffer.from(code).toString("base64");
        return `export default "data:image/svg+xml;base64,${base64}"`;
      },
    },
  };
}

export default defineConfig([
  // Server bundle: CJS + ESM with type declarations
  {
    entry: { index: "src/server/index.ts" },
    format: ["cjs", "esm"],
    outDir: "dist/server",
    define,
    clean: true,
    fixedExtension: false,
    target: "node20",
    deps: {
      skipNodeModulesBundle: true,
    },
    outputOptions: {
      exports: "named",
    },
    plugins: [svgPlugin()],
  },
  // CLI bundle: ESM only, executable
  {
    entry: { [packageName]: "src/cli/index.ts" },
    format: ["esm"],
    outDir: "dist",
    define,
    target: "node20",
    deps: {
      skipNodeModulesBundle: true,
    },
    plugins: [svgPlugin()],
  },
  // Client bundle: IIFE for browser, minified
  {
    entry: { [`${packageName}-${packageVersion}`]: "src/client/verdaccio.ts" },
    format: ["iife"],
    outDir: "dist/client",
    define,
    platform: "browser",
    target: "ES6",
    minify: true,
    outputOptions: {
      entryFileNames: "[name].js",
    },
    plugins: [svgPlugin()],
  },
]);
