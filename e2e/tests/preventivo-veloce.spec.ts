import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Preventivo in 30 secondi (docs/changelog/2026-11-08-preventivo-in-30-secondi.md):
 * nel modulo del preventivo le prestazioni del profilo si aggiungono con un
 * tocco (prima quella adatta alla descrizione), il prezzo si copia solo se è
 * "a lavoro", e "Usa il preventivo di …" riparte dall'ultimo dello stesso
 * mestiere, con "Annulla".
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const pro = await createProfessional(prisma, "Veloce Idraulica");
  await prisma.professionalService.createMany({
    data: [
      { professionalProfileId: pro.id, name: "Spurgo scarichi", priceMinEurCents: 7000, priceMaxEurCents: 12000, categorySlug: "idraulico" },
      { professionalProfileId: pro.id, name: "Posa piastrelle bagno", priceMinEurCents: 3000, priceMaxEurCents: 5000, priceUnit: "SQUARE_METER", categorySlug: "idraulico" },
      { professionalProfileId: pro.id, name: "Sostituzione rubinetto", priceMinEurCents: 5000, priceMaxEurCents: 8000, categorySlug: "idraulico" },
    ],
  });
  const client = await createClient(prisma);
  // Un preventivo già mandato per lo stesso mestiere, su un'altra richiesta.
  const old = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(2, "09:00"), description: "Scarico della doccia lento da settimane." });
  await prisma.quote.update({ where: { id: old.quotes[0]!.id }, data: { notes: "Materiale compreso." } });
  // La richiesta nuova, ancora senza preventivo.
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: category.id, description: "Il rubinetto della cucina perde di continuo.", city: "Latina", serviceMode: "HOME" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  return { pro };
}

async function openQuoteForm(page: Page) {
  await page.goto("/dashboard/richieste");
  await page.getByText("Il rubinetto della cucina perde", { exact: false }).first().click();
  await page.getByRole("button", { name: "Prepara il preventivo" }).first().click();
  await expect(page.getByText("Dalle tue prestazioni")).toBeVisible();
}

const names = (page: Page) => page.getByRole("textbox", { name: "Voce del preventivo" });

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`voci con un tocco e preventivo di prima (${device})`, async ({ browser }) => {
    const { pro } = await setup();
    const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
    const page = await pageAsClient(browser, owner.userId, size);
    await openQuoteForm(page);

    // Prima la prestazione adatta alla descrizione, segnata.
    const pills = page.locator(".quick-service-pill");
    await expect(pills.first()).toContainText("Sostituzione rubinetto");
    await expect(pills.first()).toContainText("Adatta alla richiesta");

    await page.screenshot({ path: `test-results/preventivo-veloce-${device}.png`, fullPage: false });

    // Un tocco: la riga vuota "Manodopera" diventa la prestazione, con i suoi prezzi.
    await pills.first().click();
    await expect(pills.first()).toHaveAttribute("aria-pressed", "true");
    await expect(names(page)).toHaveCount(1);
    await expect(names(page).first()).toHaveValue("Sostituzione rubinetto");
    await expect(page.getByRole("textbox", { name: "Prezzo minimo in euro" }).first()).toHaveValue("50");
    await expect(page.getByRole("textbox", { name: "Prezzo massimo in euro" }).first()).toHaveValue("80");

    // Al m² il prezzo non è un totale: si aggiunge la voce senza cifre.
    await pills.filter({ hasText: "Posa piastrelle bagno" }).click();
    await expect(names(page)).toHaveCount(2);
    await expect(page.getByRole("textbox", { name: "Prezzo minimo in euro" }).nth(1)).toHaveValue("");

    // Toccata di nuovo, la voce si toglie.
    await pills.filter({ hasText: "Posa piastrelle bagno" }).click();
    await expect(names(page)).toHaveCount(1);

    // L'ultimo preventivo dello stesso mestiere sostituisce le voci, e si può annullare.
    await expect(page.getByRole("button", { name: /Usa il preventivo di oggi/ })).toBeVisible();
    await names(page).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/preventivo-veloce-${device}-dopo.png`, fullPage: false });
    await page.getByRole("button", { name: /Usa il preventivo/ }).click();
    await expect(names(page).first()).toHaveValue("Sostituzione sifone");
    await expect(page.getByRole("textbox", { name: "Messaggio per il cliente" })).toHaveValue("Materiale compreso.");
    await expect(page.getByText("Voci copiate: controlla i prezzi.")).toBeVisible();
    await page.getByRole("button", { name: "Annulla la copia" }).click();
    await expect(names(page).first()).toHaveValue("Sostituzione rubinetto");
    await expect(page.getByRole("textbox", { name: "Messaggio per il cliente" })).toHaveValue("");

    const axe = await new AxeBuilder({ page }).include(".quick-service-pill").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    await page.context().close();
  });
}

test("la manodopera parte dal prezzo dell'ultimo preventivo, e il profilo invita ad aggiungere le prestazioni", async ({ browser }) => {
  const pro = await createProfessional(prisma, "Manodopera Ricordata");
  const client = await createClient(prisma);
  const old = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(2, "09:00"), description: "Scarico della doccia lento." });
  await prisma.quoteItem.updateMany({ where: { quoteId: old.quotes[0]!.id }, data: { name: "Manodopera", priceMinEurCents: 4000, priceMaxEurCents: 6000 } });
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: category.id, description: "Il rubinetto della cucina perde di continuo.", city: "Latina", serviceMode: "HOME" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  const page = await pageAsClient(browser, owner.userId, COMPUTER);

  await page.goto("/dashboard/richieste");
  await page.getByText("Il rubinetto della cucina perde", { exact: false }).first().click();
  await page.getByRole("button", { name: "Prepara il preventivo" }).first().click();
  await expect(names(page).first()).toHaveValue("Manodopera");
  await expect(page.getByRole("textbox", { name: "Prezzo minimo in euro" }).first()).toHaveValue("40");
  await expect(page.getByRole("textbox", { name: "Prezzo massimo in euro" }).first()).toHaveValue("60");
  await expect(page.getByText("La manodopera parte dal prezzo del tuo ultimo preventivo: cambialo se serve.")).toBeVisible();

  await page.goto("/dashboard/profilo#profilo-prestazioni");
  const hint = page.locator(".services-hint");
  await expect(hint).toContainText("Aggiungi le prestazioni per rispondere più in fretta");
  await hint.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/preventivo-veloce-profilo-suggerimento.png" });
  const axe = await new AxeBuilder({ page }).include(".services-hint").analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  await page.context().close();
});
