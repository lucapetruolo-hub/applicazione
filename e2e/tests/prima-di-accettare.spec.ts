import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Il riquadro "Prima di accettare" su un telefono stretto (collaudo
 * dell'08/11/2026, E6-01, docs/changelog/2026-11-08-collaudo-lancio-testi-rotti.md):
 * la riga sul saldo automatico si leggeva una lettera per riga, schiacciata
 * dall'importo che non va a capo. Qui il pagamento online è acceso con una
 * risposta finta del server, così compaiono le righe con le cifre.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Il difetto era solo sul telefono stretto.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("le righe del riquadro si leggono per intero e la cifra resta dentro il riquadro", async ({ browser }) => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "10:00"), paymentOptions: ["ONLINE"] });

  const page = await pageAsClient(browser, client.id, PHONE);
  // Pagamento online acceso come sul sito pubblicato (senza Stripe la CI lo tiene spento).
  await page.route("**/health/features", (route) => route.fulfill({ json: { onlinePayments: true } }));
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  const card = page.locator(`#request-${request.id}`);
  await card.locator(`#quote-${quotes[0].id}`).getByText("Accetta preventivo", { exact: true }).click();
  // Si accetta in una finestra a parte (docs/changelog/2026-11-18-accettare-il-preventivo.md).
  const dialog = page.getByRole("dialog", { name: "Accetta il preventivo" });
  await expect(dialog.getByRole("heading", { name: "Accetta il preventivo" })).toBeVisible();

  const amounts = dialog.getByTestId("quote-accept-amounts");
  await expect(amounts.getByText("Paghi ora, con la carta")).toBeVisible();
  await expect(amounts.getByText("A lavoro finito", { exact: true })).toBeVisible();
  await expect(amounts.getByText("In automatico, sulla stessa carta")).toBeVisible();

  // Foto del riquadro per guardarlo a occhio (in locale: FOTO_PRIMA_DI_ACCETTARE=percorso.png).
  if (process.env.FOTO_PRIMA_DI_ACCETTARE) {
    await dialog.getByTestId("quote-accept-dialog").screenshot({ path: process.env.FOTO_PRIMA_DI_ACCETTARE });
  }
  const box = (await amounts.boundingBox())!;
  // Niente che sporge dal riquadro.
  expect(await amounts.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const label of ["Paghi ora, con la carta", "In automatico, sulla stessa carta"]) {
    const text = amounts.getByText(label, { exact: true });
    const rect = (await text.boundingBox())!;
    // La colonna del testo è larga almeno 150 px: mai una lettera per riga.
    expect(rect.width, label).toBeGreaterThanOrEqual(150);
    // Niente parole spezzate a metà: la riga non è più alta di tre righe di testo.
    expect(rect.height, label).toBeLessThanOrEqual(3 * 24);
    expect(rect.x + rect.width, label).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  const amountTexts = await amounts.locator("span, div").filter({ hasText: /^(da )?[\d.,–\s\u00A0]+€( a [\d.,\s\u00A0]+€)?$/ }).all();
  expect(amountTexts.length).toBeGreaterThanOrEqual(1);
  for (const amount of amountTexts) {
    const rect = (await amount.boundingBox())!;
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(rect.x).toBeGreaterThanOrEqual(box.x - 1);
  }
  // La cifra del resto sta sulla riga di "A lavoro finito", non sotto la spiegazione.
  const restLabel = (await amounts.getByText("A lavoro finito", { exact: true }).boundingBox())!;
  const restHint = (await amounts.getByText("In automatico, sulla stessa carta").boundingBox())!;
  const restAmount = (await amounts.getByText(/^(da|fino a) [\d]/).boundingBox())!;
  expect(restAmount.y).toBeLessThan(restHint.y);
  expect(Math.abs(restAmount.y + restAmount.height - (restLabel.y + restLabel.height))).toBeLessThanOrEqual(8);
  await page.context().close();
});
