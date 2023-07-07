const path = require("path");

const nodeExternals = require("webpack-node-externals");

/** @type {import("webpack").Configuration[]} */
module.exports = [
  {
    mode: "production",
    target: "node",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
      extensions: [".ts", ".js"],
    },
    entry: {
      server: path.resolve(__dirname, "src/server/index.ts"),
      cli: path.resolve(__dirname, "src/cli/index.ts"),
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name]/index.js",
      library: {
        type: "commonjs2",
      },
    },
    externals: [nodeExternals()],
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "babel-loader",
        },
        {
          test: /\.json$/,
          loader: "webpack-json-access-optimizer",
        },
      ],
    },
  },
  {
    mode: "production",
    target: "browserslist",
    entry: {
      "verdaccio-5": path.resolve(__dirname, "src/client/verdaccio-5.ts"),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
      extensions: [".ts", ".js"],
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "client/[name].js",
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "babel-loader",
        },
      ],
    },
  },
];
