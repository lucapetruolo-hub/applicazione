import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * "Completa profilo" porta al passo giusto
 * (docs/changelog/2026-11-19-completa-profilo-passo-giusto.md, segnalazione di
 * Luca): un professionista appena iscritto salva il profilo e torna su Oggi
 * senza ricaricare la pagina. Prima Oggi credeva ancora che il profilo non ci
 * fosse e "Completa profilo" riportava al Profilo pubblico; ora mostra il
 * percorso con il passo che manca, i dati fiscali.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Basta un telefono e un computer.");
});

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

test("dopo il primo salvataggio Oggi porta ai dati fiscali, non di nuovo al profilo", async ({ page }) => {
  const stamp = `${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      role: "PROFESSIONAL",
      email: `pro-nuovo-${stamp}@test.it`,
      name: "Marco",
      surname: "Prova",
      phone: `+3933${stamp.slice(-8)}`,
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
      signupCategorySlugs: ["idraulico"],
    },
  });
  const token = testToken(user.id);
  await page.addInitScript(
    ([origin, value]) => {
      if (window.location.origin !== origin) return;
      localStorage.setItem("cookie-consent-v1", "denied");
      localStorage.setItem("professionisti_token", value);
    },
    [new URL(WEB_URL).origin, token] as const,
  );

  await page.goto("/dashboard");
  // Senza profilo Oggi mostra tutto il percorso, con il profilo pubblico come
  // primo passo (docs/changelog/2026-11-19-completa-profilo-migliorie.md).
  const steps = page.getByRole("list", { name: "Passi per completare il profilo" });
  await expect(steps).toBeVisible();
  // Da telefono con quattro passi si legge solo il nome di quello da fare.
  await expect(steps.getByRole("listitem")).toHaveCount(4);
  await expect(steps.getByRole("listitem").first()).toContainText("Profilo");
  await page.getByRole("link", { name: "Crea il profilo pubblico" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profilo/);
  await expect(page.getByRole("heading", { name: "Ora il tuo profilo pubblico" })).toBeVisible();

  await page.getByLabel("Nome attività").fill(`Idraulica Prova ${stamp.slice(-4)}`);
  const city = page.getByRole("combobox", { name: "Città" }).or(page.getByLabel("Città", { exact: true })).first();
  await city.fill("Latina");
  await city.press("Escape");
  await page.getByRole("button", { name: "Salva profilo" }).last().click();

  // Senza Stripe nella prova niente piano: la domanda sugli orari, poi "Più tardi" torna su Oggi senza ricaricare.
  const saved = page.getByRole("dialog", { name: "Profilo salvato" });
  await expect(saved).toBeVisible();
  // Con la finestra aperta i popup delle notifiche di benvenuto aspettano:
  // prima da telefono coprivano "Più tardi".
  await expect(page.locator(".toast-stack")).toBeHidden();
  await saved.getByRole("button", { name: "Più tardi" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByRole("heading", { name: "Completa il profilo", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Crea il profilo pubblico" })).toHaveCount(0);
  // Il profilo resta in testa come passo fatto: "1 di N", non di nuovo "0 di N".
  await expect(page.getByRole("region", { name: "Completa il profilo" })).toContainText(/1 di \d fatti/);
  // Al primo profilo arrivano insieme le richieste già aperte in zona: un solo
  // popup che le conta, non uno per giro fino a coprire lo schermo. Lo si
  // chiude come farebbe la persona prima di andare avanti.
  await page.waitForTimeout(3000);
  expect(await page.locator(".toast-card").count()).toBeLessThanOrEqual(1);
  const toasts = page.locator(".toast-stack");
  for (let i = 0; i < 20 && (await toasts.count()) > 0; i++) {
    const more = toasts.locator(".toast-more");
    await ((await more.count()) > 0 ? more : toasts.getByRole("button", { name: "Chiudi la notifica" }).first()).click();
  }
  await page.getByRole("link", { name: "Compila i dati fiscali" }).click();
  await expect(page).toHaveURL(/\/dashboard\/fiscale/);
});
