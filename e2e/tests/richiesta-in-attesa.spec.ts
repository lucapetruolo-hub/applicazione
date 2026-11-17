import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { COMPUTER, createClient, pageAsClient, PHONE, testToken } from "../fixtures/preventivi";

/**
 * Richieste in attesa di un mestiere che nessuno fa ancora vicino al cliente
 * (docs/changelog/2026-11-17-richieste-in-attesa.md): al posto di "Ce ne
 * occupiamo noi" il cliente lascia una richiesta completa, senza "Oggi", che
 * resta aperta 60 giorni; l'admin vede chi cercare per mestiere e zona.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS_DIR;
const DESCRIPTION = `L'antenna non prende più i canali Rai dopo il temporale ${stamp}`;
const ids = { client: "", admin: "" };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Un giro solo: telefono e computer sono nella stessa prova.");
});

test.beforeAll(async () => {
  ids.client = (await createClient(prisma, "Rosa")).id;
  ids.admin = (
    await prisma.user.create({
      data: {
        role: "ADMIN",
        email: `admin-attesa-${stamp}@test.it`,
        name: "Admin",
        surname: "Attesa",
        emailVerifiedAt: new Date(),
        legalConsentAt: new Date(),
        adminRoles: ["SUPER"],
        adminTotpEnabledAt: new Date(Date.now() - 60_000),
      },
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.guidedRequest.deleteMany({ where: { clientId: ids.client } });
  await prisma.$disconnect();
});

async function adminPage(browser: Browser, device: typeof PHONE) {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
    deviceScaleFactor: 2,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            { name: "professionisti_token", value: testToken(ids.admin, { amfa: Math.floor(Date.now() / 1000) }) },
          ],
        },
      ],
    },
  });
  return context.newPage();
}

for (const [name, device] of [
  ["telefono", PHONE],
  ["computer", COMPUTER],
] as const) {
  test(`ricerca: nessuno fa ancora questo lavoro, lascia la richiesta (${name})`, async ({ browser }) => {
    const page = await pageAsClient(browser, ids.client, device);
    await page.goto(`/cerca?problema=${encodeURIComponent("l'antenna non prende i canali")}&citta=Bari`);
    await expect(page.getByText("Nessuno fa ancora questo lavoro vicino a te")).toBeVisible();
    await expect(page.getByText(/ce ne occupiamo noi/i)).toHaveCount(0);
    const leave = page.getByRole("link", { name: "Lascia la richiesta" });
    await expect(leave).toHaveAttribute("href", /attesaChiave=antennista/);
    if (SHOTS) {
      await page.getByText("Nessuno fa ancora questo lavoro vicino a te").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/1-ricerca-${name}.png` });
    }
    await page.context().close();
  });

  test(`modulo: mestiere in attesa, niente "Oggi", la richiesta si salva (${name})`, async ({ browser }) => {
    const page = await pageAsClient(browser, ids.client, device);
    await page.goto(`/preventivo?attesaChiave=antennista&citta=Bari&modalita=ONLINE&quando=TODAY&descrizione=${encodeURIComponent(`${DESCRIPTION} (${name})`)}`);
    const trade = page.getByRole("group", { name: "Chi ti serve" });
    await expect(trade).toContainText("Antennista");
    await expect(trade).toContainText("in attesa");
    await expect(trade).toContainText("Oggi nessuno lo fa vicino a te");
    const timing = page.getByRole("group", { name: "Quando ti serve?" });
    await expect(timing.getByRole("radio", { name: /Oggi/ })).toHaveCount(0);
    await expect(page.getByText(/Per oggi non c'è nessuno che fa questo lavoro vicino a te/)).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-modulo-${name}.png`, fullPage: true });
    await timing.getByRole("radio", { name: "In settimana" }).check();
    await page.getByText("Avanti", { exact: true }).click();
    await page.getByText("Avanti", { exact: true }).click();
    await expect(page.getByText(/la teniamo aperta 60 giorni e la mandiamo da sola a chi lo fa/)).toBeVisible();
    await expect(page.locator(".guided-recap strong, p strong").filter({ hasText: "Antennista" }).first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2b-riepilogo-${name}.png`, fullPage: true });
    const before = await prisma.guidedRequest.count({ where: { clientId: ids.client } });
    await page.getByRole("button", { name: /^Invia richiesta/ }).click();
    await expect(page.getByText(/Oggi nessuno fa ancora questo lavoro/).first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-inviata-${name}.png`, fullPage: true });
    await expect.poll(() => prisma.guidedRequest.count({ where: { clientId: ids.client } })).toBe(before + 1);
    const saved = await prisma.guidedRequest.findFirstOrThrow({ where: { clientId: ids.client }, orderBy: { createdAt: "desc" }, include: { leads: true } });
    expect(saved.waitingTrade).toBe("Antennista");
    expect(saved.waitingTradeKey).toBe("antennista");
    expect(saved.timing).toBe("WEEK");
    expect(saved.isUrgent).toBe(false);
    expect(saved.leads).toHaveLength(0);
    await page.context().close();
  });

  test(`admin: chi cercare per mestiere e zona (${name})`, async ({ browser }) => {
    const page = await adminPage(browser, device);
    await page.goto("/admin/richieste-da-seguire");
    await expect(page.getByText("Chi cercare")).toBeVisible();
    await expect(page.getByText("Bari e provincia").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Copia annuncio/ }).first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-admin-${name}.png`, fullPage: true });
    await page.context().close();
  });
}
