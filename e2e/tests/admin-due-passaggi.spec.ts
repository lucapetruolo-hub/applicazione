import { expect, test, type Browser } from "@playwright/test";
import { createHash } from "node:crypto";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";
import { totpNow } from "../fixtures/totp";

/**
 * Verifica in due passaggi dell'area admin (docs/CHANGELOG.md §359): al
 * primo ingresso si collega l'app; da un altro dispositivo l'area admin
 * chiede il codice prima di mostrare qualunque cosa; con il telefono perso
 * un codice via email azzera la verifica e si ricollega l'app.
 */
const prisma = new PrismaClient();
let adminId = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono: il percorso non dipende dal fuso.");
});

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      email: `admin-2fa-${Date.now()}@test.it`,
      name: "Admin",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function adminPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }, { name: "professionisti_token", value: testToken(adminId) }] }],
    },
  });
  return context.newPage();
}

test("attivazione, ingresso da un altro dispositivo e telefono perso", async ({ browser }) => {
  // Primo ingresso: password sola non basta, si attiva la verifica.
  const page = await adminPage(browser);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Proteggi l'area admin" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Codice QR/ })).toBeVisible();
  await page.getByRole("button", { name: "Non riesci a inquadrarlo? Scrivi la chiave" }).click();
  const secret = ((await page.locator(".admin-2fa-key").textContent()) ?? "").replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  // Un codice sbagliato lo dice e lascia riprovare.
  const wrong = totpNow(secret) === "000000" ? "111111" : "000000";
  await page.getByLabel("Codice di 6 cifre dell'app").fill(wrong);
  await expect(page.getByText("Codice non corretto")).toBeVisible();

  await page.getByLabel("Codice di 6 cifre dell'app").fill(totpNow(secret));
  await expect(page.locator(".admin-shell")).toBeVisible();

  const saved = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
  expect(saved.adminTotpEnabledAt).not.toBeNull();
  // Nel database la chiave non è in chiaro.
  expect(saved.adminTotpSecret).not.toContain(secret);

  // Altro dispositivo: niente area admin senza codice.
  const other = await adminPage(browser);
  await other.goto("/admin/utenti");
  await expect(other.getByRole("heading", { name: "Inserisci il codice" })).toBeVisible();
  await expect(other.locator(".admin-shell")).toHaveCount(0);
  // Un passo avanti: quello di adesso è già stato usato all'attivazione.
  await other.getByLabel("Codice di 6 cifre dell'app").fill(totpNow(secret, 1));
  await expect(other.locator(".admin-shell")).toBeVisible();

  // Telefono perso: codice via email, poi si collega il telefono nuovo.
  const lost = await adminPage(browser);
  await lost.goto("/admin");
  await lost.getByRole("button", { name: "Ho perso il telefono" }).click();
  await lost.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(lost.getByText(/Ti abbiamo mandato un codice di 6 cifre a a\*\*\*@test\.it/)).toBeVisible();
  // L'email nelle prove non parte: si mette nel database un codice noto.
  await prisma.user.update({
    where: { id: adminId },
    data: { adminResetCodeHash: createHash("sha256").update(`admin-reset:${adminId}:482913`).digest("hex") },
  });
  await lost.getByLabel("Codice di 6 cifre ricevuto per email").fill("482913");
  await expect(lost.getByRole("heading", { name: "Proteggi l'area admin" })).toBeVisible();
  const reset = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
  expect(reset.adminTotpEnabledAt).toBeNull();
  expect(reset.adminResetCodeHash).toBeNull();
  expect(reset.sessionVersion).toBe(1);

  // Il telefono nuovo si collega come la prima volta.
  await lost.getByRole("button", { name: "Non riesci a inquadrarlo? Scrivi la chiave" }).click();
  const newSecret = ((await lost.locator(".admin-2fa-key").textContent()) ?? "").replace(/\s/g, "");
  expect(newSecret).not.toBe(secret);
  await lost.getByLabel("Codice di 6 cifre dell'app").fill(totpNow(newSecret));
  await expect(lost.locator(".admin-shell")).toBeVisible();
});
