import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Date del preventivo (docs/changelog/2026-11-10-date-del-preventivo.md): gli
 * orari liberi sette giorni alla volta da oggi, un giorno per riga, con
 * l'aspetto dell'agenda del profilo (docs/changelog/2026-11-18-scelta-data-come-profilo.md). Il modulo si
 * apre sulla settimana dell'orario chiesto dal cliente, già scelto e segnato
 * "chiesto dal cliente", anche quando è tra tre settimane. Stesso elenco nella
 * "Modifica" di una data proposta dal cliente, con la sua fascia segnata.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Professionista con mattina e pomeriggio dal lunedì al sabato, ogni settimana. */
async function professionalWithWeeks(name: string) {
  const pro = await createProfessional(prisma, name);
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) =>
      [["08:00", "13:00"], ["14:00", "20:00"]].map(([startTime, endTime]) => ({ professionalProfileId: pro.id, dayOfWeek, startTime: startTime!, endTime: endTime!, allowsHome: true, homeMaxBookings: 1 })),
    ),
  });
  return pro;
}

/** Un giorno feriale tra circa tre settimane, ben oltre i primi orari in vista. */
function weekdayInThreeWeeks(): Date {
  let day = wallDay(20, "00:00");
  while (day.getUTCDay() === 0) day = new Date(day.getTime() + 86_400_000);
  return day;
}

// Stesse scritte dell'agenda del profilo: "Mer 18 Nov" (docs/changelog/2026-11-18-scelta-data-come-profilo.md).
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const dayLabel = (day: Date) => `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;

async function setup() {
  const pro = await professionalWithWeeks("Settimane Idraulica");
  const preferred = weekdayInThreeWeeks();
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

    const day = page.getByRole("radiogroup", { name: `Orari di ${dayLabel(preferred)}` });
    const chosen = day.getByRole("radio", { name: "14:00–20:00, chiesto dal cliente" });
    await expect(chosen).toBeVisible();
    await expect(chosen).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".week-slots-legend")).toHaveText(/Chiesto dal cliente/);
    // Sette giorni alla volta, non cinque settimane di pillole.
    expect(await page.locator(".week-slots-day").count()).toBeLessThanOrEqual(7);
    await page.locator(".week-slots").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/date-preventivo-${device}.png` });

    // Scegliendo un'altra fascia il pallino resta sull'orario chiesto.
    await day.getByRole("radio", { name: "08:00–13:00" }).click();
    await expect(chosen).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/Il cliente aveva chiesto/)).toBeVisible();

    // Le frecce cambiano settimana; la settimana dopo non ha l'orario chiesto né la legenda.
    await page.getByRole("button", { name: "Giorni successivi" }).click();
    await expect(day).toHaveCount(0);
    await expect(page.locator(".week-slots-legend")).toHaveCount(0);
    await page.getByRole("button", { name: "Giorni precedenti" }).click();
    await expect(chosen).toBeVisible();

    const axe = await new AxeBuilder({ page }).include(".week-slots").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    await page.context().close();
  });
}

test("Modifica di una data proposta dal cliente: stesso elenco, aperto sulla sua fascia", async ({ browser }) => {
  const pro = await professionalWithWeeks("Controproposta Idraulica");
  const client = await createClient(prisma);
  const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(2, "08:00"), end: wallDay(2, "13:00"), description: "Il boiler fa rumore quando scalda." });
  const proposed = weekdayInThreeWeeks();
  const day = proposed.toISOString().slice(0, 10);
  await prisma.quote.update({
    where: { id: quotes[0]!.id },
    data: { status: "MODIFICATION_REQUESTED", clientProposedDate: new Date(`${day}T14:00:00.000Z`), clientProposedEndDate: new Date(`${day}T20:00:00.000Z`) },
  });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  const page = await pageAsClient(browser, owner.userId, PHONE);
  await page.goto("/dashboard/richieste");
  await page.getByText("Il boiler fa rumore", { exact: false }).first().click();

  // Andamento con il passo in più: "Fissato" e "Terminato" non si sovrappongono sul telefono.
  const fixed = await page.getByText("Fissato", { exact: true }).last().boundingBox();
  const done = await page.getByText("Terminato", { exact: true }).last().boundingBox();
  expect(fixed && done && fixed.x + fixed.width <= done.x).toBe(true);
  await page.getByText("Modifica richiesta dal cliente", { exact: true }).last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/date-preventivo-andamento-telefono.png" });

  await page.getByRole("button", { name: "Modifica", exact: true }).click();

  const group = page.getByRole("radiogroup", { name: `Orari di ${dayLabel(proposed)}` });
  const proposedSlot = group.getByRole("radio", { name: "14:00–20:00, proposto dal cliente" });
  await expect(proposedSlot).toBeVisible();
  await expect(proposedSlot).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".week-slots-legend")).toHaveText(/Proposto dal cliente/);
  // Niente più menu a tendina con tutte le fasce.
  await expect(page.getByRole("combobox", { name: "Orario dall'agenda" })).toHaveCount(0);

  await group.getByRole("radio", { name: "08:00–13:00" }).click();
  await expect(group.getByRole("radio", { name: "08:00–13:00" })).toHaveAttribute("aria-checked", "true");
  await page.locator(".week-slots").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/date-preventivo-modifica-telefono.png" });
  await page.getByRole("button", { name: "Invia nuova proposta" }).click();
  await expect
    .poll(async () => (await prisma.quote.findUniqueOrThrow({ where: { id: quotes[0]!.id } })).estimatedStartDate.toISOString())
    .toBe(`${day}T08:00:00.000Z`);
  await page.context().close();
});

test.describe("richiesta del cliente", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
    test(`stesso elenco a settimane, aperto sull'orario del link (${device})`, async ({ browser }) => {
      const pro = await professionalWithWeeks("Richiesta Settimane Idraulica");
      await prisma.professionalFiscalProfile.create({ data: { professionalProfileId: pro.id, entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Anna", fiscalLastName: "Verdi" } });
      const chosen = weekdayInThreeWeeks();
      const date = chosen.toISOString().slice(0, 10);
      const context = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.isMobile, locale: "it-IT", timezoneId: "Europe/Rome" });
      const page = await context.newPage();
      await page.goto(`/preventivo?categoria=idraulico&professionista=${pro.id}&nomeProfessionista=Richiesta%20Settimane&modalita=HOME&data=${date}&fasciaOraria=14:00-20:00`);

      // Orario già scelto nel profilo: una scheda con "Cambia", come "Chi ti serve".
      const card = page.getByRole("group", { name: "Data e orario scelti" });
      await expect(card).toContainText(`${dayLabel(chosen)} · 14:00–20:00`);
      await expect(card).toContainText("A domicilio");
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/date-richiesta-scheda-${device}.png` });
      await card.getByRole("button", { name: "Cambia" }).click();

      const group = page.getByRole("radiogroup", { name: `Orari di ${dayLabel(chosen)}` });
      const slot = group.getByRole("radio", { name: "14:00–20:00" });
      await expect(slot).toBeVisible();
      await expect(slot).toHaveAttribute("aria-checked", "true");
      expect(await page.locator(".week-slots-day").count()).toBeLessThanOrEqual(7);
      await page.locator(".slot-picker").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/date-richiesta-cliente-${device}.png` });

      // "Nessuna preferenza" toglie la scelta e l'elenco resta aperto; le frecce cambiano giorni.
      await page.getByRole("radio", { name: "Nessuna preferenza" }).click();
      await expect(slot).toHaveAttribute("aria-checked", "false");
      await expect(page.getByRole("group", { name: "Data e orario scelti" })).toHaveCount(0);
      await page.getByRole("button", { name: "Giorni precedenti" }).click();
      await expect(group).toHaveCount(0);

      const axe = await new AxeBuilder({ page }).include(".slot-picker").analyze();
      expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
      await context.close();
    });
  }
});
