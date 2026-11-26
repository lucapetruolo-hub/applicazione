import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { createProfessional, testToken } from "../fixtures/preventivi";

/**
 * Numeri → Conti del mese (docs/changelog/2026-11-25-conti-del-mese.md):
 * abbonati paganti, traguardo dei 12.000 € e costi fissi scritti dall'admin,
 * che restano dopo il ricaricamento.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
let adminId = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia" && testInfo.project.name !== "computer-tokyo", "Un giro su telefono e uno su computer.");
});

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      adminTotpEnabledAt: new Date(Date.now() - 60_000),
      email: `admin-conti-${stamp}@test.it`,
      name: "Admin",
      surname: "Conti",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  adminId = admin.id;
  // Due abbonati che pagano (Base e Plus) e uno nei mesi gratis con la carta
  // (con la carta è già un Base di Stripe, con i giorni gratis davanti).
  const plans = [
    { plan: "BASE" as const, status: "ACTIVE" as const, gross: 2318, free: false },
    { plan: "PLUS" as const, status: "ACTIVE" as const, gross: 7198, free: false },
    { plan: "BASE" as const, status: "ACTIVE" as const, gross: 0, free: true },
  ];
  for (const [index, row] of plans.entries()) {
    const profile = await createProfessional(prisma, `Conti ${index} ${stamp}`);
    await prisma.subscription.create({
      data: {
        professionalProfileId: profile.id,
        plan: row.plan,
        status: row.status,
        stripeSubscriptionId: `sub_conti_${stamp}_${index}`,
        cardAddedAt: new Date(),
        trialEndsAt: row.free ? new Date(Date.now() + 30 * 24 * 3600_000) : null,
      },
    });
    if (row.gross > 0) {
      await prisma.payment.create({ data: { professionalProfileId: profile.id, type: "SUBSCRIPTION", amountEurCents: row.gross, status: "SUCCEEDED" } });
    }
  }
  // Pagina pulita: l'elenco dei costi è uno solo per tutto il sito.
  await prisma.platformMonthlyCost.deleteMany({ where: { id: { not: "" } } });
  await prisma.platformAccountsSettings.deleteMany({ where: { id: { not: "" } } });
});

test.afterAll(() => prisma.$disconnect());

test("Conti del mese: abbonati, traguardo e costi fissi", async ({ browser }, testInfo) => {
  const isMobile = testInfo.project.name === "telefono-italia";
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile,
    hasTouch: isMobile,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            { name: "professionisti_token", value: testToken(adminId, { amfa: Math.floor(Date.now() / 1000) }) },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  await page.goto("/admin/conti-del-mese");
  await expect(page.getByRole("heading", { level: 2, name: "Conti del mese" })).toBeVisible();
  await expect(page.getByText("Abbonati che pagano oggi")).toBeVisible();
  await expect(page.getByText(/Traguardo: 12\.000/)).toBeVisible();

  // Richieste agli abbonati del mese (26/11): nessuna richiesta finta, quindi chi non ne ha.
  await expect(page.getByText("Richieste agli abbonati")).toBeVisible();
  await expect(page.getByText(/nessuna richiesta/)).toBeVisible();

  // Traguardo scritto dall'admin: resta dopo il ricaricamento.
  await page.getByRole("button", { name: "Cambia il traguardo" }).click();
  await page.getByRole("textbox", { name: "Utile all'anno, in euro" }).fill("20000");
  await page.getByRole("button", { name: "Salva il traguardo" }).click();
  await expect(page.getByText(/Traguardo: 20\.000/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Traguardo: 20\.000/)).toBeVisible();

  // Costi fissi (l'elenco si azzera prima di ogni giro): si parte dalla stima, si corregge una voce e si salva.
  await page.getByRole("button", { name: "Parti dalla stima" }).click();
  await page.getByRole("textbox", { name: "Euro al mese della voce 1" }).fill("70");
  await page.getByRole("button", { name: "Salva i costi" }).click();
  await expect(page.getByText("Costi salvati.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Euro al mese della voce 1" })).toHaveValue("70,00");

  await page.getByText("Vedi i numeri").click();
  await expect(page.getByRole("cell", { name: "Abbonamenti e passaggi di livello" })).toBeVisible();

  await page.evaluate(() => document.querySelectorAll("*").forEach((el) => ((el as HTMLElement).style.transition = "none")));
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`conti-del-mese-${isMobile ? "telefono" : "computer"}.png`), fullPage: true });
  await context.close();
});
