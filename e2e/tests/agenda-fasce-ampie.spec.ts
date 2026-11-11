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
    await expect(pending).toContainText("verso le 10:00 · fascia 08:00–19:00");
    // Alla sua ora: sotto il segno delle 10, sopra quello delle 11.
    const hours = page.locator(".ag-hours > div");
    const ten = (await hours.filter({ hasText: /^10:00$/ }).boundingBox())!;
    const box = (await pending.boundingBox())!;
    expect(Math.abs(box.y - ten.y)).toBeLessThan(14);

    const clientPage = await pageAsClient(browser, client.id, COMPUTER);
    await clientPage.goto("/le-mie-richieste");
    await expect(clientPage.getByText("Arrivo verso le 10:00").first()).toBeVisible();
    await clientPage.context().close();
  } finally {
    await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
    await prisma.lead.deleteMany({ where: { guidedRequestId: request.id } });
    await prisma.guidedRequest.delete({ where: { id: request.id } });
  }
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
  await expect(page.getByText('Il cliente vede "Arrivo verso le 16:30"')).toBeVisible();
  await arrival.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("campo-arrivo.png") });

  // Fascia di due ore: niente campo, basta la fascia.
  await page.getByRole("radio", { name: /^08:00–10:00/ }).first().click();
  await expect(arrival).toHaveCount(0);
  await page.context().close();
});
