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

  // Le notifiche di benvenuto dell'account nuovo arrivano come popup sopra la
  // pagina e coprono i pulsanti a caso: questa prova non le riguarda, si nascondono.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".toast-stack { display: none !important; }";
      document.head.appendChild(style);
    });
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Completa il tuo profilo per iniziare" })).toBeVisible();
  // Senza profilo il primo passo è proprio il profilo: nome, mestiere e città.
  await page.getByRole("link", { name: "Completa profilo" }).click();
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
  await saved.getByRole("button", { name: "Più tardi" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByRole("heading", { name: "Completa il profilo", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completa il tuo profilo per iniziare" })).toHaveCount(0);
  await page.getByRole("link", { name: "Compila i dati fiscali" }).click();
  await expect(page).toHaveURL(/\/dashboard\/fiscale/);
});
