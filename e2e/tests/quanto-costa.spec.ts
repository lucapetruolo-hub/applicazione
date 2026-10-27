import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import type { ServicePriceIndexEntry } from "@professionisti/shared";
import { API_URL } from "../fixtures/env";
import { createProfessional } from "../fixtures/preventivi";

/**
 * "Quanto costa in media?" della home (docs/CHANGELOG.md §383): ogni voce
 * apre l'elenco di chi offre la prestazione e il numero della voce coincide
 * con l'elenco; le cifre compaiono da 3 professionisti con un prezzo, come
 * mediana e intervallo tipico; la pastiglia ✕ toglie il filtro; la scheda
 * mette in evidenza la prestazione e la richiesta parte con il lavoro scritto.
 */
// Come un cliente che non ha ancora un account.
test.use({ storageState: { cookies: [], origins: [] } });

const prisma = new PrismaClient();
const SERVICE = `Tinteggiatura pareti prova ${Date.now()}`;
const names = ["Rossi Pitture", "Colori Bianchi", "Verdi Decorazioni"].map((name) => `${name} ${Date.now()}`);

test.beforeAll(async () => {
  // Tre professionisti visibili con prezzi 8, 10 e 15 € (centro della fascia) e
  // uno in pausa con la stessa prestazione, che non deve contare.
  const prices: [number, number][] = [
    [600, 1000],
    [1000, 1000],
    [1200, 1800],
  ];
  for (const [index, name] of names.entries()) {
    const profile = await createProfessional(prisma, name, "imbianchino");
    await prisma.professionalService.create({
      data: { professionalProfileId: profile.id, name: index === 1 ? ` ${SERVICE.toUpperCase()} ` : SERVICE, priceMinEurCents: prices[index]![0], priceMaxEurCents: prices[index]![1] },
    });
  }
  const paused = await createProfessional(prisma, `In pausa ${Date.now()}`, "imbianchino");
  await prisma.professionalProfile.update({ where: { id: paused.id }, data: { pausedAt: new Date() } });
  await prisma.professionalService.create({ data: { professionalProfileId: paused.id, name: SERVICE, priceMinEurCents: 50000 } });
});

test.afterAll(() => prisma.$disconnect());

test("ogni voce ha lo stesso numero di professionisti dell'elenco che apre", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Controllo sull'API: basta un giro.");
  const entries = (await (await request.get(`${API_URL}/professionals/services/price-index`)).json()) as ServicePriceIndexEntry[];
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    const results = (await (await request.get(`${API_URL}/professionals/search?service=${encodeURIComponent(entry.name)}`)).json()) as unknown[];
    expect(results.length, entry.name).toBe(entry.professionalCount);
  }
  const ours = entries.find((entry) => entry.name.toLowerCase() === SERVICE.toLowerCase());
  expect(ours).toEqual({ name: SERVICE, professionalCount: 3, price: { pricedCount: 3, lowEurCents: 900, medianEurCents: 1000, highEurCents: 1300 } });
});

test("dalla voce all'elenco filtrato, alla richiesta con il lavoro scritto, e ritorno a tutti", async ({ page }) => {
  await page.goto("/");
  const tool = page.getByLabel("Cerca un lavoro per conoscere il prezzo medio");
  await tool.fill(SERVICE.slice(0, 30));
  const entry = page.getByRole("link", { name: new RegExp(`^${SERVICE}, in media 10.€, di solito 9–13.€`) });
  await expect(entry).toBeVisible();
  await entry.click();

  await expect(page).toHaveURL(/\/cerca\?servizio=/);
  await expect(page.getByRole("link", { name: `Togli il filtro ${SERVICE}` })).toBeVisible();
  for (const name of names) await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(page.getByText(/^In pausa/)).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  // La città si chiede senza obbligarla, e il filtro resta.
  await page.getByLabel("In che città ti serve?").fill("Latina");
  await page.getByRole("button", { name: "Cerca vicino" }).click();
  await expect(page).toHaveURL(/servizio=.*citta=Latina|citta=Latina.*servizio=/);
  await expect(page.getByRole("link", { name: `Togli il filtro ${SERVICE}` })).toBeVisible();

  // Il profilo porta con sé la prestazione: la richiesta parte con il lavoro scritto.
  await page.getByRole("link", { name: names[0]!, exact: true }).click();
  await expect(page).toHaveURL(/servizio=/);
  await page.getByRole("link", { name: `Richiedi un preventivo a ${names[0]}` }).first().click();
  await expect(page).toHaveURL(/descrizione=/);
  await expect(page.getByLabel("Descrivi il lavoro")).toHaveValue(`${SERVICE}. `);

  // La ✕ toglie solo il filtro del servizio.
  await page.goBack();
  await page.goBack();
  await page.getByRole("link", { name: `Togli il filtro ${SERVICE}` }).click();
  await expect(page).toHaveURL(/\/cerca\?citta=Latina$/);
});
