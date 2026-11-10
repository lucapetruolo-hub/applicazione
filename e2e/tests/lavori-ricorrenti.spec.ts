import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Lavori ricorrenti (docs/changelog/2026-11-09-lavori-ricorrenti.md): il
 * preventivo di un mestiere a visite ripetute offre "Ogni quanto?";
 * accettato una volta, le visite dei prossimi 28 giorni entrano in agenda da
 * sole. Il cliente salta una visita, il professionista interrompe il lavoro.
 * Le visite create dall'attività di ogni ora e il pagamento sono provati nei
 * test dell'API.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function weeklyCleaning(clientName: string, businessName: string) {
  const client = await createClient(prisma, clientName);
  const pro = await createProfessional(prisma, businessName, "pulizie");
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(2, "09:00"), description: "Pulizie di casa ogni settimana, 3 ore." });
  const pulizie = await prisma.category.findFirstOrThrow({ where: { slug: "pulizie" } });
  await prisma.guidedRequest.update({ where: { id: request.id }, data: { categoryId: pulizie.id } });
  await prisma.quote.update({ where: { id: quotes[0]!.id }, data: { repeatEvery: "WEEKLY" } });
  return { client, pro, request, quote: quotes[0]! };
}

const serious = (violations: { impact?: string | null }[]) => violations.filter((v) => v.impact === "critical" || v.impact === "serious");

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`pulizie ogni settimana: le visite in agenda e "Salta questa volta" (${device})`, async ({ browser }) => {
    const { client, request, quote } = await weeklyCleaning("Giulia", `Pulizie Settimanali ${device}`);
    expect((await acceptQuote(client.id, quote.id)).status).toBe(201);

    // La prima visita più quelle dei prossimi 28 giorni, alla stessa ora.
    const series = await prisma.recurringJob.findUniqueOrThrow({ where: { quoteId: quote.id }, include: { bookings: { orderBy: { recurringNumber: "asc" } } } });
    expect(series.frequency).toBe("WEEKLY");
    expect(series.bookings.map((b) => b.recurringNumber)).toEqual([1, 2, 3, 4]);
    expect(series.bookings.every((b) => b.status === "CONFIRMED")).toBe(true);
    expect(series.bookings[1]!.scheduledAt.getTime() - series.bookings[0]!.scheduledAt.getTime()).toBe(7 * 86_400_000);

    const page = await pageAsClient(browser, client.id, size);
    await page.goto(`/le-mie-richieste?tab=lavori&open=${request.id}`);
    const box = page.getByRole("region", { name: "Lavoro ricorrente" });
    await expect(box).toBeVisible();
    await expect(box.getByText("Lavoro ricorrente · Ogni settimana")).toBeVisible();
    await expect(box.getByRole("listitem")).toHaveCount(4);
    await box.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/lavori-ricorrenti-${device}.png` });
    expect(serious((await new AxeBuilder({ page }).include("[data-testid=recurring-visits]").analyze()).violations)).toEqual([]);

    // Salta la terza visita: solo quella si annulla, le altre restano.
    const third = series.bookings[2]!;
    await box.getByRole("listitem").nth(2).getByRole("button", { name: /^Salta questa volta/ }).click();
    await box.getByRole("button", { name: "Sì, salta" }).click();
    await expect(box.getByText("Saltata")).toBeVisible();
    await expect.poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: third.id } })).status).toBe("CANCELED");
    expect(await prisma.booking.count({ where: { recurringJobId: series.id, status: "CONFIRMED" } })).toBe(3);
    await page.screenshot({ path: `test-results/lavori-ricorrenti-${device}-saltata.png` });
    await page.context().close();
  });
}

test("il professionista propone ogni quanto e interrompe il lavoro ricorrente", async ({ browser }) => {
  const { client, pro, quote } = await weeklyCleaning("Marta", "Pulizie Che Si Ripetono");
  expect((await acceptQuote(client.id, quote.id)).status).toBe(201);
  const series = await prisma.recurringJob.findUniqueOrThrow({ where: { quoteId: quote.id } });

  const page = await pageAsClient(browser, pro.userId, COMPUTER);
  // In Agenda le visite si riconoscono: icona nel riquadro e "Ogni settimana" nel dettaglio.
  const second = await prisma.booking.findFirstOrThrow({ where: { recurringJobId: series.id, recurringNumber: 2 } });
  await page.goto(`/dashboard/agenda?booking=${second.id}`);
  const sheet = page.getByRole("dialog", { name: /^Appuntamento con/ });
  await expect(sheet.locator(".ag-pill", { hasText: "Ogni settimana" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Salta questa volta" })).toBeVisible();
  await expect(page.locator(".ag-ev .ag-ev-repeat").first()).toBeAttached();
  await page.screenshot({ path: "test-results/lavori-ricorrenti-agenda.png" });
  expect(serious((await new AxeBuilder({ page }).include(".ag-sheet").analyze()).violations)).toEqual([]);

  await page.goto("/dashboard/richieste");
  await page.getByText("Pulizie di casa ogni settimana", { exact: false }).first().click();
  const box = page.getByRole("region", { name: "Lavoro ricorrente" });
  await expect(box).toBeVisible();
  await box.getByRole("button", { name: "Interrompi il lavoro ricorrente" }).click();
  await expect(box.getByText(/Interrompere\? Le visite future/)).toBeVisible();
  await box.getByRole("button", { name: "Sì, interrompi" }).click();
  await expect(box.getByText("Interrotto da te: niente più visite.")).toBeVisible();
  // La prima visita torna un lavoro normale: si annulla, non si "salta".
  await expect(page.getByRole("button", { name: "Annulla il lavoro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salta questa volta" })).toHaveCount(0);

  // La prima visita resta, le altre si tolgono, e il cliente lo sa.
  const after = await prisma.recurringJob.findUniqueOrThrow({ where: { id: series.id }, include: { bookings: { orderBy: { recurringNumber: "asc" } } } });
  expect(after.stoppedBy).toBe("PROFESSIONAL");
  expect(after.bookings.map((b) => b.status)).toEqual(["CONFIRMED", "CANCELED", "CANCELED", "CANCELED"]);
  expect(await prisma.notification.count({ where: { userId: client.id, type: "RECURRING_JOB_STOPPED" } })).toBe(1);
  await page.screenshot({ path: "test-results/lavori-ricorrenti-interrotto.png" });
  await page.context().close();
});

test("solo i mestieri a visite ripetute offrono \"Ogni quanto?\" nel preventivo", async ({ browser }) => {
  const client = await createClient(prisma, "Paola");
  const pro = await createProfessional(prisma, "Pulizie Nuove Richieste", "pulizie");
  const pulizie = await prisma.category.findFirstOrThrow({ where: { slug: "pulizie" } });
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: pulizie.id, description: "Pulizia delle scale del condominio ogni due settimane.", city: "Latina", serviceMode: "HOME" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });

  const page = await pageAsClient(browser, pro.userId, PHONE);
  await page.goto("/dashboard/richieste");
  await page.getByText("Pulizia delle scale del condominio", { exact: false }).first().click();
  await page.getByRole("button", { name: "Prepara il preventivo" }).first().click();
  const group = page.getByRole("group", { name: "Ogni quanto" });
  await expect(group).toBeVisible();
  await expect(group.getByText("Una volta")).toBeVisible();
  await expect(group.getByText("Ogni 2 settimane")).toBeVisible();
  await group.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/lavori-ricorrenti-preventivo.png" });
  expect(serious((await new AxeBuilder({ page }).include("[aria-label='Ogni quanto']").analyze()).violations)).toEqual([]);
  await page.context().close();
});
