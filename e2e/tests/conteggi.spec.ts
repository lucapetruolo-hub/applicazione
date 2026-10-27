import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { createClient, createProfessional, testToken } from "../fixtures/preventivi";

/**
 * Conteggi dell'andamento del sito (docs/CHANGELOG.md §372): su un percorso
 * noto ogni contatore sale di 1, e di 0 per i robot e per chi ha "Non
 * contare questo browser" (admin e account di prova). Per la richiesta i
 * passi contati si confrontano con le righe salvate nel database.
 */
test.use({ storageState: { cookies: [], origins: [] } });
// Il browser lo sceglie la prova: basta un giro.
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "telefono-italia"));

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const DESCRIPTION = encodeURIComponent("Perdita d'acqua sotto il lavandino della cucina.");
const REQUEST_URL = `/preventivo?categoria=idraulico&citta=Latina&modalita=ONLINE&descrizione=${DESCRIPTION}`;

const today = () => {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day;
};

async function searchCount(): Promise<number> {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const rows = await prisma.categorySearchDay.aggregate({ where: { categoryId: category.id, day: today() }, _sum: { count: true } });
  return rows._sum.count ?? 0;
}

async function stepCounts(origin?: "GENERAL" | "PROFILE"): Promise<Record<string, number>> {
  const rows = await prisma.requestStepDay.groupBy({ by: ["step"], where: { day: today(), ...(origin ? { origin } : {}) }, _sum: { count: true } });
  return Object.fromEntries(rows.map((r) => [r.step, r._sum.count ?? 0]));
}

async function failureCount(form: string, kind: string): Promise<number> {
  const row = await prisma.submitFailureDay.findFirst({ where: { form, kind, day: today() } });
  return row?.count ?? 0;
}

/** Il conteggio parte dopo la risposta: si aspetta che arrivi nel database. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 800));

async function newContext(browser: Browser, options: { userAgent?: string; noCount?: boolean; clientId?: string } = {}): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    // Un browser vero: quello di Playwright senza schermo conta come robot.
    userAgent: options.userAgent ?? "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: {
      cookies: options.noCount ? [{ name: "non_contare", value: "1", domain: new URL(WEB_URL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }] : [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [{ name: "cookie-consent-v1", value: "denied" }, ...(options.clientId ? [{ name: "professionisti_token", value: testToken(options.clientId) }] : [])],
        },
      ],
    },
  });
  return context;
}

test.describe("ricerca", () => {
  for (const [name, options, expected] of [
    ["un cliente conta 1", {}, 1],
    ["un robot conta 0", { userAgent: GOOGLEBOT }, 0],
    ["\"Non contare questo browser\" conta 0", { noCount: true }, 0],
  ] as const) {
    test(name, async ({ browser }) => {
      const context = await newContext(browser, options);
      const page = await context.newPage();
      const before = await searchCount();
      await page.goto("/cerca/idraulico/latina");
      await expect(page.locator("h1").first()).toBeVisible();
      await settle();
      expect(await searchCount()).toBe(before + expected);
      await context.close();
    });
  }
});

test.describe("passi della richiesta", () => {
  test("un percorso noto: ogni passo sale di 1 e la richiesta salvata torna con il conteggio", async ({ browser }) => {
    const client = await createClient(prisma);
    const context = await newContext(browser, { clientId: client.id });
    const page = await context.newPage();
    const before = await stepCounts();
    const savedBefore = await prisma.guidedRequest.count({ where: { clientId: client.id } });

    await page.goto(REQUEST_URL);
    await page.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name: "Con calma" }).check();
    await page.getByText("Avanti", { exact: true }).click();
    await page.getByText("Avanti", { exact: true }).click();
    await expect(page.getByRole("group", { name: "Opzioni di invio" })).toBeVisible();
    await page.getByRole("button", { name: /^Invia richiesta/ }).click();
    await expect.poll(() => prisma.guidedRequest.count({ where: { clientId: client.id } })).toBe(savedBefore + 1);
    await settle();

    const after = await stepCounts();
    const delta = (step: string) => (after[step] ?? 0) - (before[step] ?? 0);
    expect({ LAVORO: delta("LAVORO"), DOVE: delta("DOVE"), RIEPILOGO: delta("RIEPILOGO"), ACCESSO: delta("ACCESSO"), INVIATA: delta("INVIATA") }).toEqual({
      LAVORO: 1,
      DOVE: 1,
      RIEPILOGO: 1,
      // Già entrato: niente finestra di accesso.
      ACCESSO: 0,
      INVIATA: 1,
    });
    // Riconciliazione: richieste contate dal browser = righe salvate.
    expect(delta("INVIATA")).toBe((await prisma.guidedRequest.count({ where: { clientId: client.id } })) - savedBefore);
    await context.close();
  });

  test("dalla pagina di un professionista: il passo conta come richiesta dal profilo", async ({ browser }) => {
    const professional = await createProfessional(prisma, "Paolo Verdi Idraulica");
    const client = await createClient(prisma);
    const context = await newContext(browser, { clientId: client.id });
    const page = await context.newPage();
    const before = { profile: await stepCounts("PROFILE"), general: await stepCounts("GENERAL") };
    await page.goto(`${REQUEST_URL}&professionista=${professional.id}&nomeProfessionista=Paolo%20Verdi`);
    await expect(page.getByRole("group", { name: "Quando ti serve?" })).toBeVisible();
    await settle();
    expect((await stepCounts("PROFILE")).LAVORO ?? 0).toBe((before.profile.LAVORO ?? 0) + 1);
    expect((await stepCounts("GENERAL")).LAVORO ?? 0).toBe(before.general.LAVORO ?? 0);
    await context.close();
  });

  test("account di prova con \"Non contare\": nessun passo contato", async ({ browser }) => {
    const client = await createClient(prisma);
    const context = await newContext(browser, { clientId: client.id, noCount: true });
    const page = await context.newPage();
    const before = await stepCounts();
    await page.goto(REQUEST_URL);
    await page.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name: "Con calma" }).check();
    await page.getByText("Avanti", { exact: true }).click();
    await page.getByText("Avanti", { exact: true }).click();
    await expect(page.getByRole("group", { name: "Opzioni di invio" })).toBeVisible();
    await settle();
    expect(await stepCounts()).toEqual(before);
    await context.close();
  });

  test("un invio non riuscito per errore del sito conta 1", async ({ browser }) => {
    const client = await createClient(prisma);
    const context = await newContext(browser, { clientId: client.id });
    const page = await context.newPage();
    await page.route(`${API_URL}/guided-requests`, (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 503, json: { message: "Prova: richiesta non salvata." } }) : route.fallback(),
    );
    const before = await failureCount("RICHIESTA", "SERVER");
    await page.goto(REQUEST_URL);
    await page.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name: "Con calma" }).check();
    await page.getByText("Avanti", { exact: true }).click();
    await page.getByText("Avanti", { exact: true }).click();
    await page.getByRole("button", { name: /^Invia richiesta/ }).click();
    await expect.poll(() => failureCount("RICHIESTA", "SERVER")).toBe(before + 1);
    await context.close();
  });
});
