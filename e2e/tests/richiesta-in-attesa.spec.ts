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

// L'admin ha sempre una richiesta in attesa da mostrare, anche quando la CI
// divide le prove e quella del modulo gira su un'altra macchina.
test.beforeAll(async () => {
  const host = await prisma.category.findFirstOrThrow({ where: { slug: "tuttofare" } });
  await prisma.guidedRequest.create({
    data: {
      clientId: ids.client,
      categoryId: host.id,
      description: `Parabola storta dopo il vento ${stamp}`,
      city: "Bari",
      serviceMode: "ONLINE",
      timing: "WEEK",
      waitingTrade: "Antennista",
      waitingTradeKey: "antennista",
      expiresAt: new Date(Date.now() + 60 * 24 * 3600_000),
    },
  });
});

// Due antennisti fuori zona da Lecce: Brindisi (circa 37 km) e Taranto (circa 81).
const far = [
  { city: "Brindisi", latitude: 40.6327, longitude: 17.9418 },
  { city: "Taranto", latitude: 40.4644, longitude: 17.247 },
];
const farIds: string[] = [];

test.beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "elettricista" } });
  for (const place of far) {
    const user = await prisma.user.create({
      data: { role: "PROFESSIONAL", email: `antenne-${place.city}-${stamp}@test.it`, name: "Prova", surname: place.city, emailVerifiedAt: new Date(), legalConsentAt: new Date() },
    });
    const profile = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        businessName: `Antenne ${place.city} ${stamp}`,
        ...place,
        services: { create: [{ name: "Installazione antenna TV", priceMinEurCents: 8000 }] },
        fiscalProfile: { create: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Prova", fiscalLastName: place.city } },
      },
    });
    farIds.push(profile.id);
  }
});

test.afterAll(async () => {
  await prisma.professionalProfile.updateMany({ where: { id: { in: farIds } }, data: { deletedAt: new Date() } });
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

  test(`ricerca: nessuno vicino, il più vicino a quanti km e tutti gli altri dal più vicino (${name})`, async ({ browser }) => {
    const page = await pageAsClient(browser, ids.client, device);
    await page.goto(`/cerca?problema=${encodeURIComponent("l'antenna non prende i canali")}&citta=Lecce`);
    await expect(page.getByText("Nessuno fa ancora questo lavoro vicino a te")).toBeVisible();
    await expect(page.getByText(/Nessuno lo fa entro \d+ km da Lecce\. Il più vicino è a circa 3\d km: qui sotto trovi tutti i 2, dal più vicino/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Lascia la richiesta" })).toHaveAttribute("href", /attesaChiave=antennista/);
    // La riga generica della lista non si ripete.
    await expect(page.getByText(/ti mostriamo i? ?più vicin/)).toHaveCount(0);
    const brindisi = page.locator("a:visible", { hasText: `Antenne Brindisi ${stamp}` }).first();
    const taranto = page.locator("a:visible", { hasText: `Antenne Taranto ${stamp}` }).first();
    await expect(brindisi).toBeVisible();
    await expect(taranto).toBeVisible();
    const [b, t] = [await brindisi.boundingBox(), await taranto.boundingBox()];
    expect(b!.y).toBeLessThan(t!.y);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/5-piu-vicino-${name}.png` });
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
    await expect(page.getByText("Chi cercare", { exact: true })).toBeVisible();
    await expect(page.getByText("Bari e provincia").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Copia annuncio/ }).first()).toBeVisible();
    const most = page.locator(".most-requested");
    await expect(page.getByText("Più richiesti", { exact: true })).toBeVisible();
    const antennista = most.locator("li").filter({ hasText: "Antennista" });
    await expect(antennista).toBeVisible();
    // Accanto al mestiere le zone da cui arrivano le richieste.
    await expect(antennista.locator(".most-requested-zones")).toContainText(/Bari \d+/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-admin-${name}.png`, fullPage: true });
    // "Invita un professionista" apre il modulo già compilato.
    const invite = page.locator(".waiting-group", { hasText: "Antennista" }).filter({ hasText: "Bari e provincia" }).getByRole("link", { name: "Invita un professionista" });
    await expect(invite).toHaveAttribute("href", "/admin/professionisti?mestiere=Antennista&citta=Bari");
    await invite.click();
    await expect(page.getByText(/Dalle richieste in attesa: Antennista a Bari/)).toBeVisible();
    await expect(page.getByLabel("Presentazione")).toHaveValue("Faccio il lavoro di antennista.");
    await expect(page.getByPlaceholder(/Comune/)).toHaveValue("Bari");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/6-invito-${name}.png`, fullPage: true });
    await page.context().close();
  });
}
