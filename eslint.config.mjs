// Config ESLint unica del monorepo (formato "flat", ESLint 10), al posto di
// `packages/config/eslint.base.js` che non era mai stato collegato: stesse
// regole di base (eslint:recommended + typescript-eslint, niente `any`
// esplicito), più gli hooks di React e le regole di Next.js per `apps/web`.
import { join } from "node:path";
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
    // Un deleteMany() senza condizione svuota la tabella intera (skill
    // prisma-patterns, docs/changelog/2026-11-16-skill-prisma-da-ecc.md).
    // Se svuotarla è voluto, eslint-disable-next-line con il motivo accanto.
    files: ["apps/api/src/**/*.ts"],
    ignores: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='deleteMany'][arguments.length=0]",
          message: "deleteMany() senza where cancella tutte le righe: aggiungi { where: ... }.",
        },
        {
          selector: "CallExpression[callee.property.name='deleteMany'] > ObjectExpression:first-child[properties.length=0]",
          message: "deleteMany({}) cancella tutte le righe: aggiungi { where: ... }.",
        },
        {
          selector: "CallExpression[callee.property.name='deleteMany'] > ObjectExpression:first-child > Property[key.name='where'] > ObjectExpression[properties.length=0]",
          message: "deleteMany({ where: {} }) cancella tutte le righe: metti una condizione vera.",
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin, "jsx-a11y": jsxA11y },
    // Percorso assoluto: il lint parte da apps/web (turbo), non dalla radice,
    // e con "apps/web" relativo la regola dei link non trovava le pagine.
    settings: { next: { rootDir: join(import.meta.dirname, "apps/web") } },
    rules: {
      // Anche le regole del React Compiler della versione 7 (setState dentro
      // un effetto, valori impuri durante il render...) sono errori, come
      // quelle degli hooks di sempre: le eccezioni sono spiegate nel codice
      // accanto a un eslint-disable (docs/CHANGELOG.md §318).
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Accessibilità (campi senza etichetta, immagini senza testo
      // alternativo, elementi cliccabili non raggiungibili da tastiera...),
      // tutte errori dal docs/CHANGELOG.md §318.
      ...jsxA11y.flatConfigs.recommended.rules,
      // Una miniatura <img> con un testo alternativo può fare da pulsante
      // (ARIA in HTML lo consente): apre la foto grande (MediaPreview).
      "jsx-a11y/no-noninteractive-element-to-interactive-role": [
        "error",
        { ...jsxA11y.flatConfigs.recommended.rules["jsx-a11y/no-noninteractive-element-to-interactive-role"][1], img: ["button"] },
      ],
      // ItalianDateInput e ItalianTimeInput contengono un <input> nativo (docs/CHANGELOG.md §291, §365).
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["ItalianDateInput", "ItalianTimeInput"], depth: 3 }],
    },
  },
);
