import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@professionisti/database";
import { acceptQuote, COMPUTER, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay, wallFromNow } from "../fixtures/preventivi";

/**
 * La scheda del lavoro in ogni stato, fotografata da telefono e da computer
 * (docs/CHANGELOG.md §346). Le foto finiscono in e2e/schede-results/ (nella
 * CI tra i risultati del job "agenda-browser"): a ogni modifica si guardano
 * tutte insieme invece di ricreare a mano ogni caso. Ogni stato controlla
 * anche la scritta che lo distingue.
 */
const prisma = new PrismaClient();
const OUT = fileURLToPath(new URL("../schede-results/", import.meta.url));

type Setup = { bookingId: string; professionalProfileId: string; clientId: string };
type State = {
  name: string;
  start: Date;
  end?: Date;
  serviceMode?: "HOME" | "ONLINE";
  /** Cambia il lavoro appena creato dall'accettazione. */
  after?: (setup: Setup) => Promise<unknown>;
  /** Scritta che deve comparire nella scheda. */
  expectText?: string | RegExp;
  /** Scritte che non devono comparire. */
  absentText?: string[];
};

const booking = (id: string, data: Prisma.BookingUpdateInput) => prisma.booking.update({ where: { id }, data });

const STATES: State[] = [
  { name: "01-tra-tre-giorni", start: wallDay(3, "10:00"), expectText: "Tra 3 giorni", absentText: ["Lavoro terminato"] },
  { name: "02-domani", start: wallDay(1, "09:00"), expectText: "Domani" },
  { name: "03-oggi", start: wallFromNow(150), expectText: /Oggi|Domani/ },
  { name: "04-sta-arrivando", start: wallFromNow(30), after: ({ bookingId }) => booking(bookingId, { onTheWayAt: new Date() }), expectText: "sta arrivando" },
  { name: "05-in-corso", start: wallFromNow(-30), end: wallFromNow(90), expectText: "Lavoro in corso", absentText: ["Aggiungi al calendario", "Annulla appuntamento"] },
  { name: "06-finito-da-confermare", start: wallDay(-1, "10:00"), end: wallDay(-1, "12:00"), expectText: "Lavoro terminato", absentText: ["Annulla appuntamento"] },
  {
    name: "07-da-recensire",
    start: wallDay(-2, "10:00"),
    after: ({ bookingId }) => booking(bookingId, { status: "COMPLETED", clientConfirmedCompletedAt: new Date(), finalAmountEurCents: 11000 }),
    expectText: "Lascia una recensione",
  },
  {
    name: "08-recensito",
    start: wallDay(-6, "10:00"),
    after: async ({ bookingId }) => {
      await booking(bookingId, { status: "COMPLETED", clientConfirmedCompletedAt: new Date(), finalAmountEurCents: 11000 });
      await prisma.review.create({ data: { bookingId, rating: 5, comment: "Puntuale e preciso." } });
    },
    absentText: ["Lascia una recensione"],
  },
  {
    name: "09-annullato-dal-professionista",
    start: wallDay(2, "15:00"),
    after: ({ bookingId }) => booking(bookingId, { status: "CANCELED", canceledBy: "PROFESSIONAL", cancellationNote: "Ho avuto un imprevisto, mi dispiace." }),
    absentText: ["Chiama"],
  },
  { name: "10-annullato-da-te", start: wallDay(2, "16:00"), after: ({ bookingId }) => booking(bookingId, { status: "CANCELED", canceledBy: "CLIENT" }), absentText: ["Chiama"] },
  { name: "11-online", start: wallDay(2, "18:00"), serviceMode: "ONLINE", absentText: ["Via Emanuele Filiberto"] },
  { name: "12-piu-giorni", start: wallDay(5, "08:00"), end: wallDay(7, "17:00"), expectText: /^Dal / },
  {
    name: "13-acconto-online-pagato",
    start: wallDay(4, "11:00"),
    after: ({ bookingId }) =>
      prisma.jobPayment.update({
        where: { bookingId },
        data: { paymentMethod: "MANOVIA", onlineStage: "DEPOSIT_PAID", depositEurCents: 2400, depositPaidAt: new Date(), paidEurCents: 2400 },
      }),
  },
  {
    name: "14-segnalazione-aperta",
    start: wallDay(-1, "09:00"),
    after: ({ bookingId }) => prisma.jobIssue.create({ data: { bookingId, type: "BAD_WORK", description: "Il sifone perde ancora.", status: "OPEN" } }),
    absentText: ["Lavoro terminato", "Annulla appuntamento"],
  },
  {
    name: "15-professionista-eliminato",
    start: wallDay(3, "14:00"),
    after: ({ professionalProfileId }) => prisma.professionalProfile.update({ where: { id: professionalProfileId }, data: { deletedAt: new Date() } }),
    expectText: "Questo appuntamento non si farà",
    absentText: ["Chiama", "Messaggi", "Aggiungi al calendario", "Annulla appuntamento"],
  },
  {
    name: "16-non-presentato",
    start: wallDay(-3, "10:00"),
    after: ({ bookingId }) => booking(bookingId, { status: "NO_SHOW" }),
    expectText: "Appuntamento segnato come mancato",
    absentText: ["Annulla appuntamento"],
  },
];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Le foto da telefono e da computer si fanno tutte qui.");
  testInfo.setTimeout(300_000);
});

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const state of STATES) {
  test(`scheda del lavoro: ${state.name}`, async ({ browser }) => {
    const client = await createClient(prisma);
    const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: state.start, end: state.end, serviceMode: state.serviceMode });
    const response = await acceptQuote(client.id, quotes[0].id);
    expect(response.status, await response.clone().text()).toBe(201);
    const { bookingId } = (await response.json()) as { bookingId: string };
    await state.after?.({ bookingId, professionalProfileId: pro.id, clientId: client.id });

    for (const [device, settings] of [
      ["telefono", PHONE],
      ["computer", COMPUTER],
    ] as const) {
      const page = await pageAsClient(browser, client.id, settings);
      await page.goto(`/le-mie-richieste?open=${request.id}`);
      const card = page.locator(`#request-${request.id}`);
      await expect(card).toBeVisible();
      if (state.expectText) await expect(card.getByText(state.expectText).first()).toBeVisible();
      for (const text of state.absentText ?? []) await expect(card.getByText(text, { exact: true })).toHaveCount(0);
      // Dall'alto della pagina intera: le barre che restano in alto scorrendo coprirebbero la scheda.
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = (await card.boundingBox())!;
      await page.screenshot({ path: `${OUT}${state.name}-${device}.png`, fullPage: true, clip: box, animations: "disabled" });
      await page.context().close();
    }
  });
}

test("scheda del lavoro: 00-appuntamento-prenotato (subito dopo Accetta)", async ({ browser }) => {
  for (const [device, settings] of [
    ["telefono", PHONE],
    ["computer", COMPUTER],
  ] as const) {
    const client = await createClient(prisma);
    const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "10:00") });
    const page = await pageAsClient(browser, client.id, settings);
    await page.goto(`/le-mie-richieste?open=${request.id}`);
    await page.locator(`#quote-${quotes[0].id}`).getByText("Accetta preventivo", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Appuntamento prenotato" })).toBeVisible();
    await page.screenshot({ path: `${OUT}00-appuntamento-prenotato-${device}.png`, fullPage: true, animations: "disabled" });
    await page.context().close();
  }
});
