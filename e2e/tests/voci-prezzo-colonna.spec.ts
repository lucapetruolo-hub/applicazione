import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Le voci del prezzo nella scheda del preventivo, una per riga
 * (docs/changelog/2026-11-11-voci-prezzo-in-colonna.md): prima stavano in fila
 * con "·" e su telefono non si capiva quale importo andava con quale voce.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Basta un telefono e un computer.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ogni voce del prezzo sta su una riga sua, con l'importo a destra", async ({ browser }, testInfo) => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "10:00") });
  await prisma.quoteItem.createMany({
    data: [
      { quoteId: quotes[0].id, name: "Manodopera", priceMinEurCents: 5000, priceMaxEurCents: 5000 },
      { quoteId: quotes[0].id, name: "Sturatura degli scarichi di cucina e bagno con sonda", priceMinEurCents: 10000, priceMaxEurCents: 10000 },
    ],
  });

  const page = await pageAsClient(browser, client.id, testInfo.project.name.startsWith("telefono") ? PHONE : COMPUTER);
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  const quote = page.locator(`#request-${request.id} #quote-${quotes[0].id}`);
  const names = ["Sostituzione sifone", "Manodopera", "Sturatura degli scarichi di cucina e bagno con sonda"];
  for (const name of names) await expect(quote.getByText(name, { exact: true })).toBeVisible();
  // Niente più la fila con il puntino.
  await expect(quote.getByText(/Manodopera.*·/)).toHaveCount(0);

  const rows = await Promise.all(names.map(async (name) => (await quote.getByText(name, { exact: true }).boundingBox())!));
  // Una sotto l'altra, nello stesso ordine del preventivo.
  expect(rows[1].y).toBeGreaterThan(rows[0].y + rows[0].height - 1);
  expect(rows[2].y).toBeGreaterThan(rows[1].y + rows[1].height - 1);
  // Gli importi allineati a destra sulla stessa colonna.
  const amounts = await Promise.all(["50 €", "100 €"].map(async (text) => (await quote.getByText(text, { exact: true }).boundingBox())!));
  expect(Math.abs(amounts[0].x + amounts[0].width - (amounts[1].x + amounts[1].width))).toBeLessThanOrEqual(1);
  // La voce lunga va a capo senza spingere l'importo fuori dalla scheda.
  const card = (await quote.boundingBox())!;
  expect(amounts[1].x + amounts[1].width).toBeLessThanOrEqual(card.x + card.width + 1);
  expect(rows[2].x + rows[2].width).toBeLessThanOrEqual(amounts[1].x);

  if (process.env.FOTO_VOCI_PREZZO) {
    await quote.getByText("Prezzo", { exact: true }).locator("xpath=../..").screenshot({ path: `${process.env.FOTO_VOCI_PREZZO}-${testInfo.project.name}.png` });
  }
});
