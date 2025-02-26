import eslint from "@eslint/js";
import { createNextImportResolver } from "eslint-import-resolver-next";
import pluginImportX from "eslint-plugin-import-x";
import pluginPerfectionist from "eslint-plugin-perfectionist";
import pluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import pluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint, { configs } from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  pluginPrettierRecommended,
  pluginUnicorn.configs["recommended"],
  pluginImportX.flatConfigs.recommended,
  pluginImportX.flatConfigs.typescript,
  ...configs.recommendedTypeChecked,
  ...configs.stylisticTypeChecked,
  pluginPerfectionist.configs["recommended-natural"],
  {
    ignores: ["node_modules/", "dist/", ".history/"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2025,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: "latest",
        projectService: true,
        sourceType: "module",
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",

      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-var-requires": "off",
      "unicorn/catch-error-name": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-null": "off",
      "unicorn/no-process-exit": "off",
      "unicorn/prefer-global-this": "off",
      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": "off",
    },
    settings: {
      "import-x/resolver": [],
      "import-x/resolver-next": [createNextImportResolver()],
    },
  },
  {
    files: ["*.mjs", "*.js"],
    ...configs.disableTypeChecked,
  },
  {
    files: ["src/client/**/*.ts"],
    rules: {
      "@typescript-eslint/prefer-nullish-coalescing": "off",
    },
  },
);
