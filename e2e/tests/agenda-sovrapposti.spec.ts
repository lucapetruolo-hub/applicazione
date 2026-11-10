import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { e2eData } from "../fixtures/data";
import { createClient } from "../fixtures/preventivi";

/**
 * Impegni nella stessa fascia affiancati, non uno sopra l'altro
 * (docs/changelog/2026-11-10-appuntamenti-sovrapposti.md): un preventivo in
 * attesa sopra un appuntamento confermato lasciava vedere uno solo dei due.
 */
const prisma = new PrismaClient();
const wall = (value: string) => new Date(`${value}:00.000Z`);
let requestId: string | null = null;

test.beforeAll(async () => {
  const profile = await prisma.professionalProfile.findFirstOrThrow({ where: { userId: e2eData().userId } });
  const client = await createClient(prisma, "Gianpaolo");
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: profile.categoryId, description: "Rubinetto che gocciola in bagno.", city: "Latina" },
  });
  requestId = request.id;
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: profile.id, priceEurCents: 0 } });
  // Lunedì 26 ottobre c'è già un appuntamento 09:00–10:30: il preventivo cade nella stessa fascia.
  await prisma.quote.create({
    data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: wall("2026-10-26T09:30"), estimatedEndDate: wall("2026-10-26T11:00"), status: "SENT" },
  });
});

test.afterAll(async () => {
  if (requestId) {
    await prisma.quote.deleteMany({ where: { guidedRequestId: requestId } });
    await prisma.lead.deleteMany({ where: { guidedRequestId: requestId } });
    await prisma.guidedRequest.delete({ where: { id: requestId } });
  }
  await prisma.$disconnect();
});

for (const view of ["Settimana", "Giorno"] as const) {
  test(`${view}: appuntamento e preventivo nella stessa fascia si vedono tutti e due`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "telefono-new-york", "Basta un telefono.");
    // Lunedì 26 alle 7 italiane: si apre la settimana dal 26.
    await page.clock.setFixedTime(new Date("2026-10-26T06:00:00Z"));
    await page.goto("/dashboard/agenda");
    await page.locator(".ag-col").first().waitFor();
    const views = page.getByRole("group", { name: "Vista" });
    if (await views.isVisible()) await views.getByRole("button", { name: view }).click();
    else await page.getByRole("combobox", { name: "Vista" }).selectOption(view === "Giorno" ? "day" : "week");
    const monday = page.locator(".ag-col").first();
    const booking = monday.locator(".ag-ev.conf").filter({ has: page.getByText(/09:00/) });
    const pending = monday.locator(".ag-ev.wait");
    await expect(booking).toHaveCount(1);
    await expect(pending).toHaveCount(1);
    await expect(pending).toContainText(view === "Settimana" && testInfo.project.name !== "computer-tokyo" ? "" : "Gianpaolo");
    const a = (await booking.boundingBox())!;
    const b = (await pending.boundingBox())!;
    // Affiancati: il confermato a sinistra, nessun pixel in comune.
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 0.5);
    expect(a.width).toBeGreaterThan(8);
    expect(b.width).toBeGreaterThan(8);
    await expect(pending).toHaveAccessibleName(/nella stessa fascia di un altro impegno/);
    await pending.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${view.toLowerCase()}.png`) });
  });
}
