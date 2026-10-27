import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { createClient, testToken } from "../fixtures/preventivi";

/**
 * Andamento del sito (docs/CHANGELOG.md §372): il super admin trova i
 * consigli in cima, la pagina si legge su telefono e computer senza
 * problemi di accessibilità, chi entra in admin non viene più contato, e
 * un account di prova si elimina per sempre con quello che ha creato.
 */
const prisma = new PrismaClient();
let adminId = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un giro: la pagina non dipende dal fuso.");
});

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      adminTotpEnabledAt: new Date(Date.now() - 60_000),
      email: `admin-andamento-${Date.now()}@test.it`,
      name: "Admin",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  adminId = admin.id;
});

test.afterAll(() => prisma.$disconnect());

async function adminPage(browser: Browser, device: { width: number; height: number; isMobile: boolean }) {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: device.width, height: device.height },
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            // Già passato dal codice della verifica in due passaggi (§359).
            { name: "professionisti_token", value: testToken(adminId, { amfa: Math.floor(Date.now() / 1000) }) },
          ],
        },
      ],
    },
  });
  return { context, page: await context.newPage() };
}

for (const device of [
  { name: "telefono", width: 390, height: 844, isMobile: true },
  { name: "computer", width: 1280, height: 900, isMobile: false },
]) {
  test(`consigli in cima e numeri leggibili (${device.name})`, async ({ browser }, testInfo) => {
    const { context, page } = await adminPage(browser, device);
    await page.goto("/admin/andamento");
    await expect(page.getByRole("heading", { name: "Cosa fare questa settimana" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Il numero guida" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lavori e città" })).toBeVisible();
    // Nessuna riga più larga dello schermo.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Chi entra in admin non viene più contato.
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "non_contare")?.value).toBe("1");
    await expect(page.getByRole("switch", { name: "Non contare questo browser" })).toHaveAttribute("aria-checked", "true");
    // I punti di riferimento (main) sono del guscio admin comune, non di questa pagina.
    const results = await new AxeBuilder({ page }).include("main").disableRules(["landmark-main-is-top-level", "landmark-no-duplicate-main", "landmark-unique"]).analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary ?? ""}`))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`andamento-${device.name}.png`), fullPage: true });
    await context.close();
  });
}

test("\"Fatto\" toglie un consiglio e \"Riapri\" lo riporta", async ({ browser }) => {
  // Sei invii della richiesta falliti oggi per un errore del sito: il consiglio "l'invio non riesce".
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const where = { form_kind_day: { form: "RICHIESTA", kind: "SERVER", day } };
  await prisma.submitFailureDay.upsert({ where, create: { form: "RICHIESTA", kind: "SERVER", day, count: 6 }, update: { count: { increment: 6 } } });
  await prisma.siteAdviceDone.deleteMany({ where: { key: "failure-server:RICHIESTA" } });

  const { context, page } = await adminPage(browser, { width: 390, height: 844, isMobile: true });
  await page.goto("/admin/andamento");
  const title = "Richiesta di preventivo: l'invio non riesce";
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: `Fatto: ${title}` }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(page.getByText("Fatti di recente")).toBeVisible();
  await page.getByRole("button", { name: `Riapri: ${title}` }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await prisma.submitFailureDay.update({ where, data: { count: { decrement: 6 } } });
  await context.close();
});

test("account di prova eliminato per sempre con le sue richieste", async ({ browser }) => {
  const client = await createClient(prisma, "Prova");
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  await prisma.guidedRequest.create({ data: { clientId: client.id, categoryId: category.id, description: "Richiesta di prova del sito.", city: "Latina" } });

  const { context, page } = await adminPage(browser, { width: 390, height: 844, isMobile: true });
  await page.goto(`/admin/utenti/${client.id}`);
  await page.getByRole("button", { name: "Elimina account di prova" }).click();
  const confirm = page.getByRole("button", { name: "Elimina per sempre" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Scrivi ELIMINA per confermare").fill("elimina");
  await confirm.click();
  await expect(page).toHaveURL(/\/admin\/utenti$/);
  expect(await prisma.user.findUnique({ where: { id: client.id } })).toBeNull();
  expect(await prisma.guidedRequest.count({ where: { clientId: client.id } })).toBe(0);
  await context.close();
});
