import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";
import { totpNow } from "../fixtures/totp";

/**
 * Verifica in due passaggi dell'area admin (docs/CHANGELOG.md §351): al
 * primo ingresso si collega l'app e si salvano i codici di recupero; da un
 * altro dispositivo l'area admin chiede il codice prima di mostrare
 * qualunque cosa, e un codice di recupero vale una volta sola.
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

test("attivazione, codici di recupero e ingresso da un altro dispositivo", async ({ browser }) => {
  // Primo ingresso: password sola non basta, si attiva la verifica.
  const page = await adminPage(browser);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Proteggi l'area admin" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Codice QR/ })).toBeVisible();
  await page.getByRole("button", { name: "Non riesci a inquadrarlo? Scrivi la chiave" }).click();
  const secret = (await page.locator(".admin-2fa-key").textContent()) ?? "";
  expect(secret.replace(/\s/g, "")).toMatch(/^[A-Z2-7]{32}$/);

  // Un codice sbagliato lo dice e lascia riprovare.
  const wrong = totpNow(secret) === "000000" ? "111111" : "000000";
  await page.getByLabel("Codice di 6 cifre dell'app").fill(wrong);
  await expect(page.getByText("Codice non corretto")).toBeVisible();

  await page.getByLabel("Codice di 6 cifre dell'app").fill(totpNow(secret));
  await expect(page.getByRole("heading", { name: "Salva i codici di recupero" })).toBeVisible();
  const codes = await page.getByRole("list", { name: "Codici di recupero" }).getByRole("listitem").allTextContents();
  expect(codes).toHaveLength(10);
  const continueButton = page.getByRole("button", { name: "Continua" });
  await expect(continueButton).toBeDisabled();
  await page.getByText("Li ho salvati in un posto sicuro").click();
  await continueButton.click();
  await expect(page.locator(".admin-shell")).toBeVisible();

  const saved = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
  expect(saved.adminTotpEnabledAt).not.toBeNull();
  // Nel database né la chiave in chiaro né i codici di recupero.
  expect(saved.adminTotpSecret).not.toContain(secret.replace(/\s/g, ""));
  expect(saved.adminRecoveryCodes.join()).not.toContain(codes[0]);

  // Altro dispositivo: niente area admin senza codice.
  const other = await adminPage(browser);
  await other.goto("/admin/utenti");
  await expect(other.getByRole("heading", { name: "Inserisci il codice" })).toBeVisible();
  await expect(other.locator(".admin-shell")).toHaveCount(0);

  // Codice di recupero: entra una volta sola.
  await other.getByRole("button", { name: "Non hai il telefono? Usa un codice di recupero" }).click();
  await other.getByLabel("Codice di recupero").fill(codes[0]!.toLowerCase());
  await other.getByRole("button", { name: "Entra" }).click();
  await expect(other.locator(".admin-shell")).toBeVisible();
  const afterRecovery = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
  expect(afterRecovery.adminRecoveryCodes).toHaveLength(9);

  const third = await adminPage(browser);
  await third.goto("/admin");
  await third.getByRole("button", { name: "Non hai il telefono? Usa un codice di recupero" }).click();
  await third.getByLabel("Codice di recupero").fill(codes[0]!);
  await third.getByRole("button", { name: "Entra" }).click();
  await expect(third.getByText("Codice non corretto")).toBeVisible();
  await third.getByRole("button", { name: "Usa il codice dell'app" }).click();
  // Un passo avanti: quello di adesso è già stato usato all'attivazione.
  await third.getByLabel("Codice di 6 cifre dell'app").fill(totpNow(secret, 1));
  await expect(third.locator(".admin-shell")).toBeVisible();
});
