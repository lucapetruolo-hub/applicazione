import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * "Le mie richieste" più leggera (docs/changelog/2026-11-09-le-mie-richieste-leggera.md):
 * l'elenco dei comuni e il controllo dei dati della fattura (zod) si caricano
 * solo quando servono. Qui si prova che, quando servono, funzionano ancora:
 * città dall'elenco nel modulo "Modifica", provincia presa dal comune nella
 * fattura e messaggio sui dati mancanti (codice fiscale) all'accettazione.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono: il percorso non dipende dal fuso.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Modifica: la città si sceglie dall'elenco dei comuni, caricato all'apertura del modulo", async ({ browser }) => {
  const client = await createClient(prisma);
  // Senza preventivi: la richiesta si può ancora modificare.
  const { request } = await createRequestWithQuotes(prisma, client.id, [], { start: wallDay(3, "10:00") });

  const page = await pageAsClient(browser, client.id, PHONE);
  await page.goto(`/le-mie-richieste?open=${request.id}&modifica=1`);
  const card = page.locator(`#request-${request.id}`);
  await expect(card.getByText("Torna alla richiesta")).toBeVisible();

  const city = card.getByPlaceholder("Città");
  await city.fill("Sabaud");
  await page.getByRole("option", { name: "Sabaudia", exact: true }).click();
  await expect(city).toHaveValue("Sabaudia");
  // Una città che non è un comune viene ancora fermata.
  await city.fill("Città inventata");
  await card.getByText("Salva modifiche", { exact: true }).click();
  await expect(card.getByText("Scegli la città dall'elenco dei comuni.")).toBeVisible();
});

test("Fattura all'accettazione: provincia dal comune e dati mancanti segnalati", async ({ browser }) => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Luca Leggero Impianti");
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "10:00") });

  const page = await pageAsClient(browser, client.id, PHONE);
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  const card = page.locator(`#request-${request.id}`);
  await card.locator(`#quote-${quotes[0].id}`).getByText("Accetta preventivo", { exact: true }).click();
  await card.getByText(/Ti serve la (fattura|ricevuta)\?/).click();

  // Comune fuori provincia di Latina: la sigla si aggiorna da sola.
  await card.getByRole("textbox", { name: "Comune", exact: true }).fill("Anzio");
  await expect(card.getByRole("textbox", { name: "Prov.", exact: true })).toHaveValue("RM");

  await card.getByText("Accetta con obbligo di pagare", { exact: true }).click();
  await expect(card.getByText("Controlla i dati per la fattura.")).toBeVisible();
  // Nessun lavoro creato con dati incompleti.
  expect(await prisma.booking.count({ where: { quoteId: quotes[0].id } })).toBe(0);
});
