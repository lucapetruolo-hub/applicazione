import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { e2eData } from "../fixtures/data";
import { COMPUTER, createClient, createProfessional, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Fasce ampie (docs/changelog/2026-11-11-fasce-ampie.md): i lavori con la
 * stessa fascia stanno uno sotto l'altro, e con l'ora indicativa di arrivo il
 * lavoro si mette a quell'ora in agenda e il cliente la vede.
 */
const prisma = new PrismaClient();
const wall = (value: string) => new Date(`${value}:00.000Z`);

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function openDay(page: import("@playwright/test").Page, view: "Giorno" | "Settimana") {
  await page.clock.setFixedTime(new Date("2026-10-26T06:00:00Z"));
  await page.goto("/dashboard/agenda");
  await page.locator(".ag-col").first().waitFor();
  const group = page.getByRole("group", { name: "Vista" });
  if (await group.isVisible()) await group.getByRole("button", { name: view }).click();
  else await page.getByRole("combobox", { name: "Vista" }).selectOption(view === "Giorno" ? "day" : "week");
  return page.locator(".ag-col").first();
}

for (const view of ["Giorno", "Settimana"] as const) {
  test(`${view}: tre lavori con la stessa fascia uno sotto l'altro`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "telefono-new-york", "Basta un telefono.");
    const profile = await prisma.professionalProfile.findFirstOrThrow({ where: { userId: e2eData().userId } });
    const slot = await prisma.availabilitySlot.create({
      data: { professionalProfileId: profile.id, dayOfWeek: 1, date: new Date("2026-10-26T00:00:00.000Z"), startTime: "08:00", endTime: "19:00", allowsHome: true, homeMaxBookings: 5 },
    });
    const names = ["Bruno Esposito", "Carla Ricci", "Dario Galli"];
    const jobs = await Promise.all(
      names.map((clientName) => prisma.externalJob.create({ data: { professionalProfileId: profile.id, clientName, scheduledAt: wall("2026-10-26T08:00"), scheduledEndAt: wall("2026-10-26T19:00") } })),
    );
    try {
      const day = await openDay(page, view);
      const rows = day.locator(".ag-ev.stacked");
      await expect(rows).toHaveCount(3);
      const boxes = (await Promise.all([0, 1, 2].map(async (i) => (await rows.nth(i).boundingBox())!))).sort((a, b) => a.y - b.y);
      // Stessa colonna, una riga sotto l'altra, senza sovrapporsi.
      for (let i = 1; i < 3; i++) {
        expect(Math.abs(boxes[i]!.x - boxes[0]!.x)).toBeLessThan(1);
        expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 0.5);
      }
      await expect(rows.filter({ hasText: names[0]!.slice(0, 3) }).first()).toHaveAccessibleName(/1 di 3 nella stessa fascia/);
      if (testInfo.project.name === "computer-tokyo" || view === "Giorno") await expect(rows.filter({ hasText: "Carla" })).toHaveAccessibleName(/2 di 3 nella stessa fascia/);
      await rows.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`pila-${view.toLowerCase()}.png`) });
      if (view === "Settimana" && testInfo.project.name === "telefono-italia") {
        // Colonne strette: un tocco mostra in basso il nome intero, "Apri" apre il lavoro.
        await rows.filter({ hasText: "Car" }).click();
        const peek = page.getByRole("dialog", { name: "Carla Ricci" });
        await expect(peek).toContainText("08:00–19:00");
        await expect(peek.getByRole("button", { name: "Apri" })).toBeFocused();
        await page.screenshot({ path: testInfo.outputPath("nome-intero.png") });
        await peek.getByRole("button", { name: "Apri" }).click();
        await expect(peek).toHaveCount(0);
        await expect(page.getByText("Carla Ricci").last()).toBeVisible();
      }
    } finally {
      await prisma.externalJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
      await prisma.availabilitySlot.delete({ where: { id: slot.id } });
    }
  });
}

test("con l'ora di arrivo il preventivo sta a quell'ora in agenda e il cliente la vede", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "computer-tokyo", "Basta il computer.");
  const profile = await prisma.professionalProfile.findFirstOrThrow({ where: { userId: e2eData().userId } });
  const client = await createClient(prisma, "Elena");
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: profile.categoryId, description: "Cassetta del bagno che perde.", city: "Latina" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: profile.id, priceEurCents: 0 } });
  const quote = await prisma.quote.create({
    data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: wall("2026-10-26T08:00"), estimatedEndDate: wall("2026-10-26T19:00"), arrivalTime: "10:00", status: "SENT" },
  });
  await prisma.quoteItem.create({ data: { quoteId: quote.id, name: "Manodopera", priceMinEurCents: 5000, priceMaxEurCents: 8000 } });
  try {
    const day = await openDay(page, "Giorno");
    const pending = day.locator(".ag-ev.wait", { hasText: "Elena" });
    await expect(pending).toContainText("arrivo 10:00–11:00 · fascia 08:00–19:00");
    // Alla sua ora: sotto il segno delle 10, sopra quello delle 11.
    const hours = page.locator(".ag-hours > div");
    const ten = (await hours.filter({ hasText: /^10:00$/ }).boundingBox())!;
    const box = (await pending.boundingBox())!;
    expect(Math.abs(box.y - ten.y)).toBeLessThan(14);

    const clientPage = await pageAsClient(browser, client.id, COMPUTER);
    await clientPage.goto("/le-mie-richieste");
    await expect(clientPage.getByText("Arrivo tra le 10:00 e le 11:00").first()).toBeVisible();
    await clientPage.context().close();
  } finally {
    await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
    await prisma.lead.deleteMany({ where: { guidedRequestId: request.id } });
    await prisma.guidedRequest.delete({ where: { id: request.id } });
  }
});

test("preventivo in attesa su tutta la fascia accanto a un lavoro preso: striscia sottile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Basta un telefono.");
  const profile = await prisma.professionalProfile.findFirstOrThrow({ where: { userId: e2eData().userId } });
  const client = await createClient(prisma, "Franco");
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: profile.categoryId, description: "Scarico della cucina lento.", city: "Latina" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: profile.id, priceEurCents: 0 } });
  const quote = await prisma.quote.create({
    data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: wall("2026-10-27T08:00"), estimatedEndDate: wall("2026-10-27T19:00"), status: "SENT" },
  });
  const job = await prisma.externalJob.create({
    data: { professionalProfileId: profile.id, clientName: "Giulia Neri", scheduledAt: wall("2026-10-27T10:00"), scheduledEndAt: wall("2026-10-27T12:00") },
  });
  try {
    await openDay(page, "Settimana");
    const tuesday = page.locator(".ag-col").nth(1);
    const strip = tuesday.locator(".ag-ev.wait.strip");
    await expect(strip).toHaveCount(1);
    await expect(strip).toHaveAccessibleName(/Franco/);
    const stripBox = (await strip.boundingBox())!;
    const jobBox = (await tuesday.locator(".ag-ev.ext", { hasText: testInfo.project.name === "computer-tokyo" ? "Giulia" : "10:00" }).boundingBox())!;
    const column = (await tuesday.boundingBox())!;
    expect(stripBox.width).toBeLessThan(14);
    // Il lavoro preso resta largo quasi tutta la colonna, senza toccare la striscia.
    expect(jobBox.width).toBeGreaterThan(column.width * 0.6);
    expect(jobBox.x + jobBox.width).toBeLessThanOrEqual(stripBox.x + 0.5);
    await strip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("striscia.png") });
  } finally {
    await prisma.externalJob.delete({ where: { id: job.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
    await prisma.lead.deleteMany({ where: { guidedRequestId: request.id } });
    await prisma.guidedRequest.delete({ where: { id: request.id } });
  }
});

test("in pila nell'ordine del Giro intelligente: prima il più vicino", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "computer-tokyo", "Basta il computer.");
  const profile = await prisma.professionalProfile.findFirstOrThrow({ where: { userId: e2eData().userId } });
  // Il professionista è a Latina: Cisterna è vicina, Terracina lontana. In ordine di nome sarebbe prima Anna.
  const slot = await prisma.availabilitySlot.create({
    data: { professionalProfileId: profile.id, dayOfWeek: 3, date: new Date("2026-10-28T00:00:00.000Z"), startTime: "08:00", endTime: "19:00", allowsHome: true, homeMaxBookings: 5 },
  });
  const jobs = await Promise.all([
    prisma.externalJob.create({ data: { professionalProfileId: profile.id, clientName: "Anna Lontani", address: "Via Roma 1, Terracina", scheduledAt: wall("2026-10-28T08:00"), scheduledEndAt: wall("2026-10-28T19:00") } }),
    prisma.externalJob.create({ data: { professionalProfileId: profile.id, clientName: "Zeno Vicini", address: "Via Roma 1, Cisterna di Latina", scheduledAt: wall("2026-10-28T08:00"), scheduledEndAt: wall("2026-10-28T19:00") } }),
  ]);
  try {
    await openDay(page, "Settimana");
    const wednesday = page.locator(".ag-col").nth(2);
    await expect(wednesday.locator(".ag-ev.stacked", { hasText: "Zeno" })).toHaveAccessibleName(/1 di 2 nella stessa fascia/);
    await expect(wednesday.locator(".ag-ev.stacked", { hasText: "Anna" })).toHaveAccessibleName(/2 di 2 nella stessa fascia/);
  } finally {
    await prisma.externalJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
    await prisma.availabilitySlot.delete({ where: { id: slot.id } });
  }
});

test("in Oggi si dice ai clienti di domani verso che ora passa", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono.");
  const pro = await createProfessional(prisma, "Arrivo Domani Idraulica");
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  const tomorrow = wallDay(1, "08:00");
  const end = new Date(tomorrow.getTime() + 11 * 3_600_000);
  const made: string[] = [];
  for (const name of ["Bianca", "Carlo"]) {
    const client = await createClient(prisma, name);
    const request = await prisma.guidedRequest.create({ data: { clientId: client.id, categoryId: owner.categoryId, description: "Lavandino che perde.", city: "Latina", serviceMode: "HOME" } });
    const quote = await prisma.quote.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, estimatedStartDate: tomorrow, estimatedEndDate: end, status: "ACCEPTED" } });
    const booking = await prisma.booking.create({
      data: { clientId: client.id, professionalProfileId: pro.id, quoteId: quote.id, scheduledAt: tomorrow, scheduledEndAt: end, status: "CONFIRMED", serviceMode: "HOME", city: "Latina" },
    });
    made.push(booking.id);
  }
  const page = await pageAsClient(browser, owner.userId, COMPUTER);
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "Dì ai clienti di domani verso che ora passi" });
  await expect(card).toBeVisible();
  await card.getByLabel("Ora di arrivo da Bianca", { exact: false }).fill("09:00");
  await card.getByLabel("Ora di arrivo da Carlo", { exact: false }).fill("14:30");
  await expect(card).toContainText("tra le 14:30 e le 15:30");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("oggi-ora-arrivo.png") });
  await card.getByRole("button", { name: "Avvisa i clienti" }).click();
  await expect(card).toContainText("Fatto: i clienti hanno ricevuto l'ora di arrivo.");
  const saved = await prisma.booking.findMany({ where: { id: { in: made } }, select: { arrivalTime: true } });
  expect(saved.map((b) => b.arrivalTime).sort()).toEqual(["09:00", "14:30"]);
  const notified = await prisma.notification.count({ where: { type: "BOOKING_ARRIVAL_TIME", payload: { path: ["bookingId"], string_contains: made[0]! } } });
  expect(notified).toBe(1);
  await page.context().close();
});

test("nel preventivo, con una fascia lunga si può dire verso che ora si passa", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Un progetto basta: la pagina si apre a misura di computer.");
  const pro = await createProfessional(prisma, "Arrivo Idraulica");
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) =>
      [["08:00", "10:00"], ["14:00", "20:00"]].map(([startTime, endTime]) => ({ professionalProfileId: pro.id, dayOfWeek, startTime: startTime!, endTime: endTime!, allowsHome: true, homeMaxBookings: 3 })),
    ),
  });
  const client = await createClient(prisma);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  let preferred = wallDay(3, "00:00");
  while (preferred.getUTCDay() === 0) preferred = new Date(preferred.getTime() + 86_400_000);
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: category.id, description: "Il boiler fa rumore la mattina.", city: "Latina", serviceMode: "HOME", preferredDate: preferred, preferredTimeSlot: "14:00-20:00" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  const page = await pageAsClient(browser, owner.userId, COMPUTER);
  await page.goto("/dashboard/richieste");
  await page.getByText("Il boiler fa rumore", { exact: false }).first().click();
  await page.getByRole("button", { name: "Prepara il preventivo" }).first().click();

  // Fascia 14:00–20:00 (sei ore), già scelta perché chiesta dal cliente: c'è il campo.
  const arrival = page.getByLabel("Ora indicativa di arrivo (facoltativa)");
  await expect(arrival).toBeVisible();
  await arrival.fill("16:30");
  await expect(page.getByText('Il cliente vede "Arrivo tra le 16:30 e le 17:30"')).toBeVisible();
  await arrival.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("campo-arrivo.png") });

  // Fascia di due ore: niente campo, basta la fascia.
  await page.getByRole("radio", { name: /^08:00–10:00/ }).first().click();
  await expect(arrival).toHaveCount(0);
  await page.context().close();
});
