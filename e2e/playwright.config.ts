import { defineConfig, devices } from "@playwright/test";
import { API_URL, WEB_URL } from "./fixtures/env";

/**
 * Prove nel browser dell'agenda (docs/CHANGELOG.md §297). Avviano API e sito
 * veri su un database di prova (DATABASE_URL), con gli stessi appuntamenti
 * aperti da un telefono in Italia, a New York e a Tokyo: l'orario mostrato
 * deve essere sempre quello italiano.
 */
const reuse = !process.env.CI;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./fixtures/global-setup.ts",
  use: {
    baseURL: WEB_URL,
    storageState: "./.auth/professionista.json",
    locale: "it-IT",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "telefono-italia", testIgnore: /tempi-compiti/, use: { ...devices["Pixel 7"], timezoneId: "Europe/Rome" } },
    { name: "telefono-new-york", testIgnore: /tempi-compiti/, use: { ...devices["Pixel 7"], timezoneId: "America/New_York" } },
    { name: "computer-tokyo", testIgnore: /tempi-compiti/, use: { ...devices["Desktop Chrome"], timezoneId: "Asia/Tokyo", locale: "en-US" } },
    // Ultima: cambia i dati (completa un lavoro, chiude un giorno).
    {
      name: "misure",
      testMatch: /tempi-compiti/,
      dependencies: ["telefono-italia", "telefono-new-york", "computer-tokyo"],
      use: { ...devices["Pixel 7"], timezoneId: "Europe/Rome" },
    },
  ],
  webServer: [
    {
      command: "node ../apps/api/dist/main.js",
      url: `${API_URL}/health`,
      reuseExistingServer: reuse,
      timeout: 120_000,
      env: {
        PORT: "3001",
        JWT_SECRET: process.env.JWT_SECRET ?? "e2e-secret",
        EMAIL_VERIFICATION_REQUIRED: "false",
        FRONTEND_URL: WEB_URL,
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        // Tutte le prove chiamano l'API dallo stesso indirizzo: il limite di 60 al minuto le farebbe fallire a caso.
        RATE_LIMIT_PER_MINUTE: "1000",
      },
    },
    {
      command: "pnpm --filter @professionisti/web start",
      url: WEB_URL,
      reuseExistingServer: reuse,
      timeout: 120_000,
    },
  ],
});
