import { defineConfig, devices } from "@playwright/test";

/**
 * Prova di ogni notte sul sito vero (docs/changelog/2026-11-19-prova-notturna-sito-vero.md).
 * Le altre prove girano su un database di prova: questa apre il sito
 * pubblicato, con gli account di prova, e si ferma alla pagina di Stripe
 * senza pagare. Nessun server avviato da qui.
 */
export const NOTTE_WEB_URL = process.env.NOTTE_WEB_URL ?? "https://applicazione-web.vercel.app";

export default defineConfig({
  testDir: "./notte",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  // Il sito vero può essere lento per un attimo: una prova fallita si ripete una volta.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-notte" }]] : "list",
  use: {
    baseURL: NOTTE_WEB_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    // Il percorso completo una volta sola, dal telefono: lascia una richiesta, che poi toglie.
    { name: "telefono", testMatch: /percorso/, use: { ...devices["Pixel 7"] } },
    // Le pagine anche con i motori di Safari e Firefox da computer.
    { name: "safari", testMatch: /pagine/, use: { ...devices["Desktop Safari"] } },
    { name: "firefox", testMatch: /pagine/, use: { ...devices["Desktop Firefox"] } },
  ],
});
