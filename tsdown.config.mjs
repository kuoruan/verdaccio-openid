import fs from "node:fs";
import process from "node:process";

import { optimize as optimizeSvg } from "svgo";
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
 * @param {object} [options]
 * @param {boolean} [options.optimize] optimize SVG with SVGO before inlining it
 * @returns {import('tsdown').TsdownPlugin} The SVG handling plugin.
 */
function svgPlugin({ optimize = false } = {}) {
  return {
    name: "svg",
    load: {
      filter: { id: /\.svg(\?raw)?$/ },
      handler(id) {
        const raw = id.endsWith("?raw");
        const filePath = raw ? id.slice(0, -4) : id;
        const code = fs.readFileSync(filePath, "utf8");
        const output = optimize
          ? optimizeSvg(code, {
              path: filePath,
              multipass: true,
              // Preserve SVG descriptions for accessibility.
              plugins: [{ name: "preset-default", params: { overrides: { removeDesc: false } } }],
            }).data
          : code;

        if (raw) return `export default ${JSON.stringify(output)}`;

        const base64 = Buffer.from(output).toString("base64");
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
    css: {
      minify: true,
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
    css: {
      minify: true,
    },
    outputOptions: {
      entryFileNames: "client/[name].[hash].js",
    },
    plugins: [svgPlugin({ optimize: true }), clientManifestPlugin()],
  },
]);
