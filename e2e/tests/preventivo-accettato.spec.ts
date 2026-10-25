import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL } from "../fixtures/env";
import { acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, testToken, wallDay, wallFromNow } from "../fixtures/preventivi";

/**
 * Dal preventivo accettato al biglietto dell'appuntamento (docs/CHANGELOG.md
 * §346): un solo lavoro per richiesta anche con due "Accetta" nello stesso
 * istante, anche se il codice se ne dimenticasse (vincolo del database), e il
 * percorso che vede il cliente.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: il percorso non dipende dal fuso.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("due preventivi della stessa richiesta accettati nello stesso istante: nasce un solo lavoro", async () => {
  const client = await createClient(prisma);
  const pros = [await createProfessional(prisma, "Marco Idraulica"), await createProfessional(prisma, "Luca Impianti")];
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, pros.map((p) => p.id), { start: wallDay(4, "10:00") });

  const responses = await Promise.all(quotes.map((quote) => acceptQuote(client.id, quote.id)));
  const statuses = responses.map((r) => r.status).sort();
  expect(statuses).toEqual([201, 409]);
  const refused = responses.find((r) => r.status === 409)!;
  expect(((await refused.json()) as { message: string }).message).toContain("Hai già accettato un altro preventivo");

  const jobs = await prisma.booking.findMany({ where: { quote: { guidedRequestId: request.id } } });
  expect(jobs).toHaveLength(1);
  expect(jobs[0].guidedRequestId).toBe(request.id);

  // Anche un secondo tentativo dopo, con calma, viene rifiutato.
  const late = quotes.find((q) => q.id !== jobs[0].quoteId)!;
  expect((await acceptQuote(client.id, late.id)).status).toBe(409);

  // Il professionista non scelto lo vede: la richiesta non resta "in attesa del cliente".
  const notChosen = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: late.professionalProfileId } });
  const leads = (await (await fetch(`${API_URL}/professionals/me/leads`, { headers: { Authorization: `Bearer ${testToken(notChosen.userId)}` } })).json()) as {
    guidedRequest: { id: string };
    quote: { otherProfessionalChosen: boolean } | null;
  }[];
  expect(leads.find((lead) => lead.guidedRequest.id === request.id)?.quote?.otherProfessionalChosen).toBe(true);
});

test("il database rifiuta un secondo lavoro sulla stessa richiesta anche senza i controlli del codice", async () => {
  const client = await createClient(prisma);
  const pros = [await createProfessional(prisma, "Paolo Termoidraulica"), await createProfessional(prisma, "Sara Servizi")];
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, pros.map((p) => p.id), { start: wallDay(5, "09:00") });
  const job = (quote: (typeof quotes)[number]) => ({
    quoteId: quote.id,
    clientId: client.id,
    professionalProfileId: quote.professionalProfileId,
    scheduledAt: quote.estimatedStartDate!,
    status: "CONFIRMED" as const,
  });

  const first = await prisma.booking.create({ data: job(quotes[0]) });
  // La richiesta la scrive il trigger, dal preventivo.
  expect(first.guidedRequestId).toBe(request.id);
  await expect(prisma.booking.create({ data: job(quotes[1]) })).rejects.toMatchObject({ code: "P2002" });

  // Annullato il primo, il secondo si può prenotare; riaprire il primo no.
  await prisma.booking.update({ where: { id: first.id }, data: { status: "CANCELED", canceledBy: "CLIENT" } });
  await prisma.booking.create({ data: job(quotes[1]) });
  await expect(prisma.booking.update({ where: { id: first.id }, data: { status: "CONFIRMED" } })).rejects.toMatchObject({ code: "P2002" });
});

test("percorso completo: Accetta, Appuntamento prenotato, biglietto con calendario, l'altro preventivo non è più accettabile", async ({ browser }) => {
  const client = await createClient(prisma);
  const pros = [await createProfessional(prisma, "Marco Rossi Idraulica"), await createProfessional(prisma, "Andrea Bianchi Impianti")];
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, pros.map((p) => p.id), { start: wallDay(3, "10:00"), end: wallDay(3, "12:00") });

  const page = await pageAsClient(browser, client.id, PHONE);
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  const card = page.locator(`#request-${request.id}`);
  await card.locator(`#quote-${quotes[0].id}`).getByText("Accetta preventivo", { exact: true }).click();

  // Schermata di conferma: titolo con il cursore sopra, per chi usa il lettore di schermo.
  const title = page.getByRole("heading", { name: "Appuntamento prenotato" });
  await expect(title).toBeVisible();
  await expect(page.locator(":focus")).toContainText("Appuntamento prenotato");
  await expect(page.getByText("Tra 3 giorni")).toBeVisible();
  await expect(page.getByText(/10:00\s?–\s?12:00/).first()).toBeVisible();

  // Aggiungi al calendario: link di Google e file .ics con l'ora italiana.
  await page.getByText("Aggiungi al calendario", { exact: true }).first().click();
  const google = page.getByRole("link", { name: /Google Calendar/ });
  await expect(google).toHaveAttribute("href", /calendar\.google\.com/);
  const ics = await page.getByRole("link", { name: /iPhone e altri/ }).getAttribute("href");
  expect(decodeURIComponent(ics ?? "")).toContain("BEGIN:VEVENT");
  expect(decodeURIComponent(ics ?? "")).toContain("T100000");

  await page.getByText("Vai all'appuntamento", { exact: true }).click();
  await expect(card.getByText("Chiama", { exact: true })).toBeVisible();
  await expect(card.getByText("Messaggi", { exact: true })).toBeVisible();
  // Prima dell'appuntamento non si conferma ancora "Lavoro terminato".
  await expect(card.getByText("Lavoro terminato", { exact: true })).toHaveCount(0);

  await card.getByText("1 altro preventivo non scelto").click();
  await expect(card.getByText("Non scelto: hai accettato un altro preventivo")).toBeVisible();
  await expect(card.locator(`#quote-${quotes[1].id}`).getByText("Accetta preventivo")).toHaveCount(0);

  const jobs = await prisma.booking.findMany({ where: { guidedRequestId: request.id } });
  expect(jobs).toHaveLength(1);
  await page.context().close();
});

test("preavviso per annullare scelto dal professionista: detto prima di Accetta, fissato sul lavoro, annullamento tardivo segnato", async ({ browser }) => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  await prisma.professionalProfile.update({ where: { id: pro.id }, data: { cancellationNoticeHours: 48 } });
  // Tra circa 30 ore: dentro le 48 ore di preavviso.
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallFromNow(30 * 60) });

  const page = await pageAsClient(browser, client.id, PHONE);
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  const card = page.locator(`#request-${request.id}`);
  await expect(card.locator(`#quote-${quotes[0].id}`).getByText("Se poi devi annullare, avvisa almeno 48 ore prima.")).toBeVisible();
  await card.locator(`#quote-${quotes[0].id}`).getByText("Accetta preventivo", { exact: true }).click();
  await page.getByText("Vai all'appuntamento", { exact: true }).click();
  await expect(card.getByText("Se devi annullare, avvisa almeno 48 ore prima.")).toBeVisible();

  // Il professionista cambia idea dopo: il lavoro già prenotato resta a 48 ore.
  await prisma.professionalProfile.update({ where: { id: pro.id }, data: { cancellationNoticeHours: 72 } });
  const job = await prisma.booking.findFirstOrThrow({ where: { guidedRequestId: request.id } });
  expect(job.cancellationNoticeHours).toBe(48);

  // Annullare si può ancora, ma resta segnato come tardivo.
  await card.getByText("Annulla appuntamento", { exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/Mancano meno di 48 ore/)).toBeVisible();
  await page.getByText("Sì, annulla prenotazione", { exact: true }).click();
  await expect.poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELED");
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: job.id } })).canceledLate).toBe(true);
  await page.context().close();
});

test("preavviso scelto nel preventivo (§348): vale quello del preventivo, non lo standard del profilo", async () => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Sara Pulizie");
  const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(6, "09:00") });
  await prisma.quote.update({ where: { id: quotes[0].id }, data: { cancellationNoticeHours: 72 } });
  const response = await acceptQuote(client.id, quotes[0].id);
  expect(response.status, await response.clone().text()).toBe(201);
  const { bookingId } = (await response.json()) as { bookingId: string };
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).cancellationNoticeHours).toBe(72);
});
