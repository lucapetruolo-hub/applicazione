import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Date del preventivo (docs/changelog/2026-11-10-date-del-preventivo.md): gli
 * orari liberi una settimana alla volta, un giorno per riga. Il modulo si
 * apre sulla settimana dell'orario chiesto dal cliente, già scelto e segnato
 * "chiesto dal cliente", anche quando è tra tre settimane.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const pro = await createProfessional(prisma, "Settimane Idraulica");
  // Mattina e pomeriggio dal lunedì al sabato, ogni settimana.
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) =>
      [["08:00", "13:00"], ["14:00", "20:00"]].map(([startTime, endTime]) => ({ professionalProfileId: pro.id, dayOfWeek, startTime: startTime!, endTime: endTime!, allowsHome: true, homeMaxBookings: 1 })),
    ),
  });
  // Un giorno feriale tra circa tre settimane, ben oltre i primi orari in vista.
  let preferred = wallDay(20, "00:00");
  while (preferred.getUTCDay() === 0) preferred = new Date(preferred.getTime() + 86_400_000);
  const client = await createClient(prisma);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const request = await prisma.guidedRequest.create({
    data: {
      clientId: client.id,
      categoryId: category.id,
      description: "Lo scarico del lavabo si intasa spesso.",
      city: "Latina",
      serviceMode: "HOME",
      preferredDate: preferred,
      preferredTimeSlot: "14:00-20:00",
    },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  return { userId: owner.userId, preferred };
}

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`si apre sulla settimana dell'orario chiesto dal cliente (${device})`, async ({ browser }) => {
    const { userId, preferred } = await setup();
    const page = await pageAsClient(browser, userId, size);
    await page.goto("/dashboard/richieste");
    await page.getByText("Lo scarico del lavabo si intasa", { exact: false }).first().click();
    await page.getByRole("button", { name: "Prepara il preventivo" }).first().click();

    const dayName = preferred.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const day = page.getByRole("radiogroup", { name: `Orari di ${dayName}` });
    const chosen = day.getByRole("radio", { name: "14:00–20:00, chiesto dal cliente" });
    await expect(chosen).toBeVisible();
    await expect(chosen).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".week-slots-legend")).toHaveText(/Chiesto dal cliente/);
    // Una settimana alla volta: al massimo sei giorni in vista, non cinque settimane di pillole.
    expect(await page.locator(".week-slots-day").count()).toBeLessThanOrEqual(6);
    await page.locator(".week-slots").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/date-preventivo-${device}.png` });

    // Scegliendo un'altra fascia il pallino resta sull'orario chiesto.
    await day.getByRole("radio", { name: "08:00–13:00" }).click();
    await expect(chosen).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/Il cliente aveva chiesto/)).toBeVisible();

    // Le frecce cambiano settimana; la settimana dopo non ha l'orario chiesto né la legenda.
    await page.getByRole("button", { name: "Settimana dopo" }).click();
    await expect(day).toHaveCount(0);
    await expect(page.locator(".week-slots-legend")).toHaveCount(0);
    await page.getByRole("button", { name: "Settimana prima" }).click();
    await expect(chosen).toBeVisible();

    const axe = await new AxeBuilder({ page }).include(".week-slots").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    await page.context().close();
  });
}
