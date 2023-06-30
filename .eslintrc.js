/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:import/recommended",
    "plugin:unicorn/recommended",
  ],
  plugins: ["simple-import-sort"],
  rules: {
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
    "unicorn/no-null": "off",
    "unicorn/no-process-exit": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/filename-case": "off",
    "unicorn/prefer-module": "off",
    "unicorn/prevent-abbreviations": "off",
  },
  settings: {
    "import/resolver": {
      node: {},
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  overrides: [
    {
      files: ["*.ts"],
      extends: ["plugin:@typescript-eslint/recommended", "plugin:import/typescript"],
      parser: "@typescript-eslint/parser",
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
};
