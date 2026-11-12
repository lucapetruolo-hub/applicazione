import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Ricerca per problema con le prestazioni e misura della categoria proposta
 * (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md): prima chi ha
 * quel lavoro tra le prestazioni, "Potrebbero fare anche questo lavoro" con gli
 * altri mestieri (mai una parola in comune qualsiasi), e in Admin quante
 * richieste tengono o cambiano la categoria proposta.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const PROBLEM = "Il rubinetto della cucina perde";
let adminId = "";
let missingTrade = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia" && testInfo.project.name !== "computer-tokyo", "Un giro su telefono e uno su computer.");
});

async function professional(slug: string, businessName: string, services: string[]) {
  const category = await prisma.category.findUniqueOrThrow({ where: { slug } });
  const user = await prisma.user.create({
    data: {
      role: "PROFESSIONAL",
      email: `${slug}-${services.length}-${stamp}-${Math.random().toString(36).slice(2, 7)}@test.it`,
      name: "Prova",
      surname: businessName,
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  return prisma.professionalProfile.create({
    data: {
      userId: user.id,
      categoryId: category.id,
      businessName,
      city: "Latina",
      latitude: 41.4677,
      longitude: 12.9036,
      services: { create: services.map((name) => ({ name, priceMinEurCents: 5000 })) },
      fiscalProfile: { create: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Prova", fiscalLastName: businessName } },
    },
  });
}

test.beforeAll(async () => {
  // I profili di un giro precedente (prova ripetuta, database locale) confonderebbero i conti.
  await prisma.professionalProfile.updateMany({
    where: { OR: ["Idraulico Caldaie ", "Idraulico Rubinetti ", "Tuttofare Rubinetti ", "Pulizie Cucine ", "Tuttofare Sartoria ", "Tecnico Lavatrici ", "Elettricista Elettrodomestici ", "Tuttofare Elettrodomestici "].map((name) => ({ businessName: { startsWith: name } })), deletedAt: null },
    data: { deletedAt: new Date() },
  });
  await professional("idraulico", `Idraulico Caldaie ${stamp}`, ["Controllo caldaia"]);
  await professional("idraulico", `Idraulico Rubinetti ${stamp}`, ["Sostituzione rubinetto"]);
  await professional("tuttofare", `Tuttofare Rubinetti ${stamp}`, ["Sostituzione rubinetto"]);
  await professional("pulizie", `Pulizie Cucine ${stamp}`, ["Pulizia cucina"]);
  // Un mestiere che il sito non ha, dichiarato tra le prestazioni (docs/changelog/2026-11-11-mestieri-che-mancano.md).
  await professional("tuttofare", `Tuttofare Sartoria ${stamp}`, ["Piccole riparazioni di sartoria"]);
  await professional("elettrodomestici", `Tecnico Lavatrici ${stamp}`, ["Riparazione lavatrice"]);
  for (const n of [1, 2]) {
    await professional("elettricista", `Elettricista Elettrodomestici ${n} ${stamp}`, ["Riparazione elettrodomestici"]);
    await professional("tuttofare", `Tuttofare Elettrodomestici ${n} ${stamp}`, ["Riparazione elettrodomestici"]);
  }

  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      adminTotpEnabledAt: new Date(Date.now() - 60_000),
      email: `admin-categoria-proposta-${stamp}@test.it`,
      name: "Admin",
      surname: "Misure",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  adminId = admin.id;
  const client = await prisma.user.create({
    data: { role: "CLIENT", email: `cliente-proposta-${stamp}@test.it`, name: "Ada", surname: "Proposta", emailVerifiedAt: new Date(), legalConsentAt: new Date() },
  });
  const tuttofare = await prisma.category.findUniqueOrThrow({ where: { slug: "tuttofare" } });
  await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: tuttofare.id, description: `Mensola da montare ${stamp}`, city: "Latina", suggestedCategorySlug: "falegname" },
  });
  // Mestiere che non abbiamo, scritto dall'IA (docs/changelog/2026-11-11-mestieri-che-mancano.md).
  const trade = `Sarto ${stamp.toString(36).replace(/[0-9]/g, "")}`;
  missingTrade = trade.charAt(0).toUpperCase() + trade.slice(1).toLowerCase();
  await prisma.problemDescription.createMany({
    data: [
      ...Array.from({ length: 7 }, () => ({ text: `Orlo dei pantaloni ${stamp}`, city: "Sabaudia", categories: [], source: "ia", missingTrade: trade })),
      ...Array.from({ length: 4 }, () => ({ text: `Accorciare la giacca ${stamp}`, city: "Roma", categories: [], source: "ia", missingTrade: trade })),
    ],
  });
});

test.afterAll(() => prisma.$disconnect());

test("prima chi fa quel lavoro, poi gli altri mestieri che potrebbero farlo", async ({ page }) => {
  await page.goto(`/cerca?problema=${encodeURIComponent(PROBLEM)}&citta=Latina`);
  await expect(page.getByText(`Idraulico Rubinetti ${stamp}`).filter({ visible: true }).first()).toBeVisible();
  const order = await page.evaluate(
    ([withService, without]) => {
      const text = document.body.innerText;
      return text.indexOf(withService) < text.indexOf(without);
    },
    [`Idraulico Rubinetti ${stamp}`, `Idraulico Caldaie ${stamp}`],
  );
  expect(order).toBe(true);

  const section = page.getByRole("region", { name: "Potrebbero fare anche questo lavoro" });
  await expect(section).toBeVisible();
  await expect(section.getByText(`Tuttofare Rubinetti ${stamp}`).filter({ visible: true })).toBeVisible();
  // Stessa scheda dei risultati, con la riga "Perché".
  await expect(section.getByText("offre «Sostituzione rubinetto»")).toBeVisible();
  // "cucina" in comune non basta: le pulizie non c'entrano.
  await expect(page.getByText(`Pulizie Cucine ${stamp}`)).toHaveCount(0);
});

test("dal profilo aperto nei risultati la richiesta parte con il problema scritto", async ({ page }) => {
  await page.goto(`/cerca?problema=${encodeURIComponent(PROBLEM)}&citta=Latina`);
  const section = page.getByRole("region", { name: "Potrebbero fare anche questo lavoro" });
  await section.getByText(`Tuttofare Rubinetti ${stamp}`).filter({ visible: true }).click();
  await expect(page).toHaveURL(/problema=/);
  await expect(page).not.toHaveURL(/servizio=/);
  const request = page.locator('a[href*="/preventivo?"][href*="professionista="]').first();
  const href = await request.getAttribute("href");
  expect(new URL(href!, "http://x").searchParams.get("descrizione")).toBe(`${PROBLEM}. `);
  await page.goto(href!);
  await expect(page.getByLabel("Descrivi il lavoro")).toHaveValue(`${PROBLEM}. `);
});

test("guasto della lavatrice: il mestiere Elettrodomestici e sotto tutti quelli che lo fanno", async ({ page }) => {
  // docs/changelog/2026-11-06-mestiere-elettrodomestici.md: prima era "fuori servizio";
  // nella sezione tutti i professionisti di altri mestieri, non più al massimo 3.
  await page.goto(`/cerca?problema=${encodeURIComponent("La lavatrice non scarica")}&citta=Latina`);
  await expect(page.getByText(`Tecnico Lavatrici ${stamp}`).filter({ visible: true }).first()).toBeVisible();
  const section = page.getByRole("region", { name: "Potrebbero fare anche questo lavoro" });
  for (const n of [1, 2]) {
    await expect(section.getByText(`Elettricista Elettrodomestici ${n} ${stamp}`).filter({ visible: true })).toBeVisible();
    await expect(section.getByText(`Tuttofare Elettrodomestici ${n} ${stamp}`).filter({ visible: true })).toBeVisible();
  }
});

test("mestiere che il sito non ha: chi lo dichiara tra le prestazioni, mai tutti", async ({ request }) => {
  const names = async (offre: string) =>
    ((await (await request.get(`${API_URL}/professionals/search?offre=${encodeURIComponent(offre)}&city=Latina`)).json()) as { businessName: string }[]).map((p) => p.businessName);
  expect(await names("Sarto")).toContain(`Tuttofare Sartoria ${stamp}`);
  expect(await names("Sarto")).not.toContain(`Pulizie Cucine ${stamp}`);
  // Solo una parola generica: nessuno, non tutti.
  expect(await names("Tecnico")).toEqual([]);
});

test("con l'avviso di sicurezza niente altri mestieri", async ({ page }) => {
  await page.goto(`/cerca?problema=${encodeURIComponent("Sento odore di gas vicino al rubinetto")}&citta=Latina`);
  await expect(page.getByRole("note", { name: "Prima di tutto la sicurezza" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Potrebbero fare anche questo lavoro" })).toHaveCount(0);
});

test("Admin: richieste che tengono o cambiano la categoria proposta", async ({ browser }, testInfo) => {
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
  await page.goto("/admin/mestieri-richiesti");
  await expect(page.getByText(/Richieste di preventivo con la categoria proposta: \d+/)).toBeVisible();
  await expect(page.getByText(/Falegname → Tutto Fare \d+/)).toBeVisible();
  // Mestieri che non abbiamo, con le zone e "Da valutare" da 10 richieste.
  const trade = page.locator("#mestieri-mancanti").getByRole("group", { name: missingTrade, exact: true });
  await expect(trade.getByText("11 richieste")).toBeVisible();
  await expect(trade.getByText("Latina e provincia 7 · Roma e provincia 4")).toBeVisible();
  await expect(trade.getByText("Da valutare")).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/admin-categoria-proposta-${testInfo.project.name}.png`, fullPage: true });
  await context.close();
});
