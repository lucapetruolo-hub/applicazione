import { defineConfig, devices } from "@playwright/test";
import { API_URL, WEB_URL } from "./fixtures/env";

/**
 * Iscrizione del professionista con la carta, Checkout di Stripe di prova
 * compreso (docs/changelog/2026-10-30-iscrizione-carta-solida.md). API
 * separata dalle prove dell'agenda: qui i pagamenti sono accesi e il lancio è
 * passato. Senza E2E_STRIPE_SECRET_KEY le prove si saltano.
 */
const reuse = !process.env.CI;

export default defineConfig({
  testDir: "./carta",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-carta" }]] : "list",
  use: {
    baseURL: WEB_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "telefono-carta", use: { ...devices["Pixel 7"], timezoneId: "Europe/Rome" } }],
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
        RATE_LIMIT_PER_MINUTE: "1000",
        STRIPE_SECRET_KEY: process.env.E2E_STRIPE_SECRET_KEY ?? "",
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
        STRIPE_PRICE_BASE: process.env.STRIPE_PRICE_BASE ?? "",
        STRIPE_TAX_RATE_IVA: process.env.STRIPE_TAX_RATE_IVA ?? "",
        LAUNCH_DATE: "2026-01-01",
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
