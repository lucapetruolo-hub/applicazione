// Config ESLint unica del monorepo (formato "flat" di ESLint 9), al posto di
// `packages/config/eslint.base.js` che non era mai stato collegato: stesse
// regole di base (eslint:recommended + typescript-eslint, niente `any`
// esplicito), più gli hooks di React e le regole di Next.js per `apps/web`.
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
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
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin, "jsx-a11y": jsxA11y },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Accessibilità (campi senza etichetta, immagini senza testo
      // alternativo, elementi cliccabili non raggiungibili da tastiera...).
      ...jsxA11y.flatConfigs.recommended.rules,
      // Per ora solo avvisi: oltre 70 elementi cliccabili (div/span con
      // onClick) da rendere usabili da tastiera uno per uno, senza bloccare
      // la CI nel frattempo (docs/CHANGELOG.md §205).
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
);
