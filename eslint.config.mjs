import path from "node:path"
import { fileURLToPath } from "node:url"
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import typescriptEslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import tsdoc from "eslint-plugin-tsdoc"
import globals from "globals"
import parser from "svelte-eslint-parser"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default [
  {
    ignores: [
      "**/*.css",
      "**/*.scss",
      "**/*.html",
      "node_modules",
      ".pnp",
      "**/.pnp.js",
      "coverage",
      "**/.turbo",
      "**/.next",
      "**/.vercel",
      "**/.DS_Store",
      "**/*.pem",
      "**/npm-debug.log*",
      "**/yarn-debug.log*",
      "**/yarn-error.log*",
      "**/.pnpm-debug.log*",
      "**/.env",
      "**/.env.*",
      "!**/.env.example",
      "**/out/",
      "**/build/",
      "**/dist/",
      "**/docs/",
      "**/.plasmo",
      "**/.swc",
      "**/keys.json",
      "**/.tsbuildinfo",
      "assets",
      "**/pnpm-lock.yaml",
      "**/package-lock.json",
      "**/yarn.lock",
      "landing"
    ]
  },
  ...compat.extends("eslint:recommended", "plugin:svelte/recommended", "prettier"),
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      tsdoc
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },

      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        extraFileExtensions: [".svelte"]
      }
    },

    rules: {}
  },
  {
    files: ["**/*.svelte"],

    languageOptions: {
      parser: parser,
      ecmaVersion: 5,
      sourceType: "script",

      parserOptions: {
        parser: "@typescript-eslint/parser"
      }
    },

    rules: {
      "no-undef": "off"
    }
  },
  ...compat
    .extends("eslint:recommended", "plugin:@typescript-eslint/recommended-requiring-type-checking", "prettier")
    .map((config) => ({
      ...config,
      files: ["./**/*.{ts,tsx}"]
    })),
  {
    files: ["./**/*.{ts,tsx}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        project: "./tsconfig.json"
      }
    },

    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error"],
      "tsdoc/syntax": "warn",
      "node/no-unsupported-features/es-syntax": ["off"]
    }
  }
]
