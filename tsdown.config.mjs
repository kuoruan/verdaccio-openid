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

/**
 * A plugin to handle SVG files, either as raw text or as base64-encoded data.
 *
 * @returns {import('tsdown').TsdownPlugin} The SVG handling plugin.
 */
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

/**
 * Map each client entry to its hashed file. The manifest sits outside the
 * directory served to browsers.
 *
 * @returns {import('tsdown').TsdownPlugin} The client manifest plugin.
 */
function clientManifestPlugin() {
  return {
    name: "client-manifest",
    generateBundle(_options, bundle) {
      const manifest = {};

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk" && output.isEntry) manifest[`${output.name}.js`] = fileName.split("/").pop();
      }

      this.emitFile({
        type: "asset",
        fileName: "client-manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
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
      neverBundle: true,
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
      neverBundle: true,
    },
    plugins: [svgPlugin()],
  },
  // Client bundle: IIFE for browser, minified. The file is named after its
  // content so the URL stays valid as long as the bytes do, and never states
  // the plugin version.
  {
    entry: { [packageName]: "src/client/verdaccio.ts" },
    format: ["iife"],
    outDir: "dist",
    define,
    platform: "browser",
    target: "ES6",
    minify: true,
    outputOptions: {
      entryFileNames: "client/[name].[hash].js",
    },
    plugins: [svgPlugin(), clientManifestPlugin()],
  },
]);
