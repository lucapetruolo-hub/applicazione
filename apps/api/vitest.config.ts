import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tetti giornalieri in memoria nelle prove, senza database
    // (docs/changelog/2026-11-16-traffico-elevato.md).
    setupFiles: ["src/test-setup.ts"],
  },
});
