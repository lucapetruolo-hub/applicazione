import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Spostamento chiesto dal professionista e lavoro terminato in anticipo
 * (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md): il
 * professionista propone un'altra data sul lavoro fissato con lo stesso modulo
 * di "Modifica", il cliente la accetta o la rifiuta e intanto annulla gratis;
 * "Lavoro terminato" prima del giorno fissato chiede la conferma del cliente,
 * e solo dopo il lavoro si chiude.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function bookedJob(name: string, description: string, days = 4) {
  const pro = await createProfessional(prisma, name);
  const client = await createClient(prisma);
  const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(days, "10:00"), end: wallDay(days, "12:00"), description });
  expect((await acceptQuote(client.id, quotes[0]!.id)).status).toBe(201);
  const booking = await prisma.booking.findFirstOrThrow({ where: { quoteId: quotes[0]!.id } });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  return { pro, owner, client, quote: quotes[0]!, booking };
}

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`il professionista propone un'altra data, il cliente la vede e può annullare gratis (${device})`, async ({ browser }) => {
    const description = `Perdita dal rubinetto del bagno (${device}).`;
    const { owner, client, booking } = await bookedJob(`Sposta Data ${device}`, description);

    const page = await pageAsClient(browser, owner.userId, size);
    await page.goto("/dashboard/richieste");
    await page.getByText(description, { exact: false }).first().click();
    await page.getByRole("button", { name: "Proponi un'altra data" }).first().click();
    await expect(page.getByText(/fino ad allora resta l'appuntamento di adesso/)).toBeVisible();
    if (await page.getByText("Inserisci data e orario manualmente").count()) await page.getByText("Inserisci data e orario manualmente").click();
    const day = wallDay(6, "15:00").toISOString().slice(0, 10);
    await page.getByLabel("Nuova data").fill(`${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`);
    await page.getByLabel("Ora di inizio").fill("15:00");
    await page.getByLabel("Ora di fine").fill("17:00");
    await page.getByLabel("Nota per il cliente").fill("Mi è saltato un intervento urgente, possiamo fare martedì pomeriggio?");
    await page.getByText(/fino ad allora resta l'appuntamento di adesso/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/sposta-modulo-professionista-${device}.png` });
    await page.getByRole("button", { name: "Invia nuova proposta" }).click();
    await expect(page.getByText("Hai proposto un'altra data: in attesa del cliente")).toBeVisible();
    await page.getByText("Hai proposto un'altra data: in attesa del cliente").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/sposta-in-attesa-professionista-${device}.png` });
    await page.context().close();

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.rescheduleProposedBy).toBe("PROFESSIONAL");
    expect(row.scheduledAt.toISOString()).toBe(booking.scheduledAt.toISOString());
    expect(await prisma.bookingReschedule.count({ where: { bookingId: booking.id, proposedBy: "PROFESSIONAL" } })).toBe(1);

    const clientPage = await pageAsClient(browser, client.id, size);
    await clientPage.goto(`/le-mie-richieste?open=${booking.guidedRequestId}`);
    await expect(clientPage.getByText("Il professionista propone un'altra data")).toBeVisible();
    await expect(clientPage.getByTestId("reschedule-free-cancel")).toBeVisible();
    await clientPage.getByText("Il professionista propone un'altra data").scrollIntoViewIfNeeded();
    await clientPage.screenshot({ path: `test-results/sposta-cliente-${device}.png` });
    await clientPage.getByRole("button", { name: "Accetta nuova data" }).click();
    await expect.poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).scheduledAt.toISOString().slice(0, 10)).toBe(day);
    await clientPage.context().close();
  });
}

test("annullare mentre aspetta una proposta del professionista non costa l'acconto, anche dentro il preavviso", async ({ browser }) => {
  const { owner, client, booking, quote } = await bookedJob("Sposta Gratis", "Caldaia in blocco.", 0);
  // Appuntamento tra poche ore: si è dentro il preavviso di 24 ore.
  await prisma.booking.update({ where: { id: booking.id }, data: { scheduledAt: wallDay(0, "23:00"), scheduledEndAt: wallDay(0, "23:30") } });
  const { testToken } = await import("../fixtures/preventivi");
  const { API_URL } = await import("../fixtures/env");
  const day = wallDay(3, "09:00").toISOString().slice(0, 10);
  const proposed = await fetch(`${API_URL}/quotes/${quote.id}/counter-propose-date`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${testToken(owner.userId)}` },
    body: JSON.stringify({ date: day, startTime: "09:00", endTime: "11:00", isManual: true }),
  });
  expect(proposed.status).toBe(201);
  expect((await prisma.bookingReschedule.findFirstOrThrow({ where: { bookingId: booking.id } })).late).toBe(true);
  const canceled = await fetch(`${API_URL}/bookings/${booking.id}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${testToken(client.id)}` } });
  expect(canceled.status).toBeLessThan(300);
  const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  expect(row.status).toBe("CANCELED");
  expect(row.canceledLate).toBe(false);

  // In Statistiche: "Spostati all'ultimo momento" conta la proposta dentro il preavviso.
  for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
    const page = await pageAsClient(browser, owner.userId, size);
    await page.goto("/dashboard/statistiche");
    const tile = page.locator(".pstats-ratio", { hasText: "Spostati all'ultimo momento" });
    await expect(tile.locator(".pstats-ratio-value")).toHaveText("1");
    await tile.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/statistiche-spostati-${device}.png` });
    await page.context().close();
  }
});

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`lavoro terminato prima del giorno: si chiede al cliente, poi si chiude con la data di oggi (${device})`, async ({ browser }) => {
    const description = `Sostituzione del miscelatore della doccia (${device}).`;
    const { owner, client, booking } = await bookedJob(`Finito Prima ${device}`, description);

    const page = await pageAsClient(browser, owner.userId, size);
    await page.goto("/dashboard/richieste");
    await page.getByText(description, { exact: false }).first().click();
    await page.getByRole("button", { name: "Azioni sulla richiesta" }).first().click();
    await page.getByRole("menuitem", { name: "Lavoro terminato" }).or(page.getByRole("button", { name: "Lavoro terminato" })).first().click();
    await expect(page.getByRole("button", { name: "Chiedi conferma al cliente" })).toBeVisible();
    await page.getByRole("button", { name: "Chiedi conferma al cliente" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/terminato-prima-chiedi-${device}.png` });
    await page.getByRole("button", { name: "Chiedi conferma al cliente" }).click();
    await expect(page.getByText(/Hai chiesto al cliente di confermare/)).toBeVisible();
    await page.getByText(/Hai chiesto al cliente di confermare/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/terminato-prima-in-attesa-${device}.png` });
    await page.context().close();

    const clientPage = await pageAsClient(browser, client.id, size);
    await clientPage.goto(`/le-mie-richieste?open=${booking.guidedRequestId}`);
    await expect(clientPage.getByText("Il lavoro è già finito?")).toBeVisible();
    await clientPage.getByText("Il lavoro è già finito?").scrollIntoViewIfNeeded();
    await clientPage.screenshot({ path: `test-results/terminato-prima-cliente-${device}.png` });
    await clientPage.getByRole("button", { name: "Lavoro terminato" }).first().click();
    await clientPage.getByRole("button", { name: "Sì, conferma" }).click();
    await expect.poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).clientConfirmedCompletedAt).not.toBeNull();
    await clientPage.context().close();

    const again = await pageAsClient(browser, owner.userId, size);
    await again.goto("/dashboard/richieste");
    await again.getByText(description, { exact: false }).first().click();
    await expect(again.getByRole("button", { name: "Lavoro terminato" }).first()).toBeVisible();
    await again.getByRole("button", { name: "Lavoro terminato" }).first().scrollIntoViewIfNeeded();
    await again.screenshot({ path: `test-results/terminato-prima-chiudi-${device}.png` });
    await again.context().close();
  });
}

/**
 * Seconda parte (stesso changelog): una sola visita di un lavoro ricorrente
 * si sposta con "Sposta", sullo stesso percorso della proposta di data, e dal
 * terzo giro senza accordo compare l'invito a scriversi in chat.
 */
async function weeklySeries(name: string) {
  const pro = await createProfessional(prisma, name, "pulizie");
  const client = await createClient(prisma);
  const description = `Pulizie di casa ogni settimana (${name}).`;
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(2, "09:00"), end: wallDay(2, "12:00"), description });
  const pulizie = await prisma.category.findFirstOrThrow({ where: { slug: "pulizie" } });
  await prisma.guidedRequest.update({ where: { id: request.id }, data: { categoryId: pulizie.id } });
  await prisma.quote.update({ where: { id: quotes[0]!.id }, data: { repeatEvery: "WEEKLY" } });
  expect((await acceptQuote(client.id, quotes[0]!.id)).status).toBe(201);
  const series = await prisma.recurringJob.findUniqueOrThrow({ where: { quoteId: quotes[0]!.id }, include: { bookings: { orderBy: { recurringNumber: "asc" } } } });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  return { owner, client, request, quote: quotes[0]!, series, description };
}

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`si sposta una sola visita del lavoro ricorrente, il cliente accetta (${device})`, async ({ browser }) => {
    const { owner, client, request, quote, series, description } = await weeklySeries(`Pulizie Sposta ${device}`);
    const third = series.bookings[2]!;

    const page = await pageAsClient(browser, owner.userId, size);
    await page.goto("/dashboard/richieste");
    await page.getByText(description, { exact: false }).first().click();
    const box = page.getByRole("region", { name: "Lavoro ricorrente" }).first();
    await box.getByRole("listitem").nth(2).getByRole("button", { name: /^Sposta questa visita/ }).click();
    await expect(page.getByText(/^Sposta la visita di/)).toBeVisible();
    if (await page.getByText("Inserisci data e orario manualmente").count()) await page.getByText("Inserisci data e orario manualmente").first().click();
    const day = new Date(third.scheduledAt.getTime() + 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Nuova data").fill(`${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`);
    await page.getByLabel("Ora di inizio").fill("14:00");
    await page.getByLabel("Ora di fine").fill("17:00");
    await page.getByText(/^Sposta la visita di/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/sposta-visita-modulo-${device}.png` });
    await page.getByRole("button", { name: "Invia nuova proposta" }).click();
    await expect(box.getByTestId("recurring-visit-date-change")).toBeVisible();
    await box.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/sposta-visita-in-attesa-${device}.png` });
    await page.context().close();

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: third.id } });
    expect(row.rescheduleProposedBy).toBe("PROFESSIONAL");
    expect(row.scheduledAt.toISOString()).toBe(third.scheduledAt.toISOString());

    const clientPage = await pageAsClient(browser, client.id, size);
    await clientPage.goto(`/le-mie-richieste?tab=lavori&open=${request.id}`);
    await expect(clientPage.getByText("Il professionista propone un'altra data")).toBeVisible();
    await clientPage.getByText("Il professionista propone un'altra data").scrollIntoViewIfNeeded();
    await clientPage.screenshot({ path: `test-results/sposta-visita-cliente-${device}.png` });
    await clientPage.getByRole("button", { name: "Accetta nuova data" }).click();
    await expect.poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: third.id } })).scheduledAt.toISOString()).toBe(`${day}T14:00:00.000Z`);
    await clientPage.context().close();
    // Le altre visite e il preventivo restano com'erano.
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: series.bookings[0]!.id } })).scheduledAt.toISOString()).toBe(series.bookings[0]!.scheduledAt.toISOString());
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).estimatedStartDate.toISOString()).toBe(series.bookings[0]!.scheduledAt.toISOString());
  });
}

test("dal terzo giro senza accordo si invita a scriversi in chat (telefono e computer)", async ({ browser }) => {
  const { owner, client, booking, quote } = await bookedJob("Tre Giri", "Tapparella bloccata in cucina.");
  const { testToken } = await import("../fixtures/preventivi");
  const { API_URL } = await import("../fixtures/env");
  const propose = (who: string, path: string, date: string) =>
    fetch(`${API_URL}/quotes/${quote.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${testToken(who)}` },
      body: JSON.stringify({ date, startTime: "09:00", endTime: "11:00", isManual: true }),
    });
  expect((await propose(owner.userId, "counter-propose-date", wallDay(6, "09:00").toISOString().slice(0, 10))).status).toBe(201);
  expect((await propose(client.id, "propose-date", wallDay(7, "09:00").toISOString().slice(0, 10))).status).toBe(201);
  expect((await propose(owner.userId, "counter-propose-date", wallDay(8, "09:00").toISOString().slice(0, 10))).status).toBe(201);
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).rescheduleRounds).toBe(3);

  for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
    const page = await pageAsClient(browser, client.id, size);
    await page.goto(`/le-mie-richieste?open=${booking.guidedRequestId}`);
    const hint = page.getByTestId("date-rounds-hint");
    await expect(hint).toBeVisible();
    await expect(hint.getByRole("button", { name: "Scrivi in chat" })).toBeVisible();
    await hint.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/tre-giri-chat-${device}.png` });
    await page.context().close();
  }
});
