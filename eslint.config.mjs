// Config ESLint unica del monorepo (formato "flat" di ESLint 9), al posto di
// `packages/config/eslint.base.js` che non era mai stato collegato: stesse
// regole di base (eslint:recommended + typescript-eslint, niente `any`
// esplicito), più gli hooks di React e le regole di Next.js per `apps/web`.
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.expo/**", "**/node_modules/**", "**/*.d.ts", "**/*.js", "**/*.cjs", "**/*.mjs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
);
