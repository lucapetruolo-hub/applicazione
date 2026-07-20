/** Config ESLint base condivisa da tutti gli apps/packages TypeScript. */
module.exports = {
  root: false,
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "error",
  },
  ignorePatterns: ["dist/**", ".next/**", ".expo/**", "node_modules/**"],
};
