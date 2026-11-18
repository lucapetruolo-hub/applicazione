import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Orari in "Oggi e domani" e tappe del Giro intelligente scelte per fascia
 * (docs/changelog/2026-11-18-orari-oggi-e-giro.md, richiesta di Luca):
 * accanto al nome la fascia completa e "Arrivo verso le"; nel giro le
 * caselle per fascia e per lavoro ricalcolano il giro sui soli scelti.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("fascia e ora di arrivo in Oggi e domani, tappe del giro scelte per fascia", async ({ browser }) => {
  test.setTimeout(120_000);
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const date = new Date(`${wallDay(1, "00:00").toISOString().slice(0, 10)}T00:00:00.000Z`);
  for (const [startTime, endTime] of [["08:00", "13:00"], ["14:00", "18:00"]] as const) {
    await prisma.availabilitySlot.create({ data: { professionalProfileId: pro.id, dayOfWeek: date.getUTCDay(), date, startTime, endTime, allowsHome: true, homeMaxBookings: 5 } });
  }
  const jobs = [
    { name: "Giulia", start: "08:00", end: "13:00", city: "Aprilia", arrival: "09:00" },
    { name: "Sara", start: "08:00", end: "13:00", city: "Latina", arrival: null },
    { name: "Luigi", start: "14:00", end: "18:00", city: "Terracina", arrival: null },
  ];
  for (const job of jobs) {
    const client = await createClient(prisma, job.name);
    const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(1, job.start), end: wallDay(1, job.end) });
    expect((await acceptQuote(client.id, quotes[0]!.id)).ok).toBe(true);
    await prisma.booking.updateMany({ where: { quoteId: quotes[0]!.id }, data: { status: "CONFIRMED", city: job.city, arrivalTime: job.arrival, recipientName: job.name, recipientSurname: "Bianchi" } });
  }

  const page = await pageAsClient(browser, pro.userId, PHONE);
  await page.goto("/dashboard");
  const giulia = page.locator(".today-appt", { hasText: "Giulia Bianchi" });
  await expect(giulia.locator(".today-time-band")).toHaveText("08:00–13:00");
  await expect(giulia.getByLabel("Arrivo verso le 09:00")).toBeVisible();
  await expect(page.locator(".today-appt", { hasText: "Sara Bianchi" }).locator(".today-time-arrival")).toHaveCount(0);

  await page.goto("/dashboard/agenda?tab=giro");
  await page.getByRole("button", { name: "Giorno successivo" }).click();
  const toggle = page.getByRole("button", { name: /Scegli le tappe/ });
  await expect(toggle).toContainText("3 di 3");
  await toggle.click();
  await expect(page.getByRole("group", { name: "Mattina · 08:00–13:00" })).toBeVisible();
  const results = await new AxeBuilder({ page }).include(".ag-rt-pick").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  // Fascia intera tolta: il giro si ricalcola senza i due lavori del mattino.
  await page.getByRole("checkbox", { name: "Tutta la fascia Mattina · 08:00–13:00" }).uncheck();
  await expect(toggle).toContainText("1 di 3");
  await expect(page.getByText("Nessuna tappa scelta")).toHaveCount(0);
  await expect(page.locator("ol").getByText(/Luigi Bianchi/)).toBeVisible();
  await expect(page.locator("ol").getByText(/Giulia Bianchi/)).toHaveCount(0);

  // La scelta resta anche ricaricando la pagina (memoria di questo dispositivo).
  await page.reload();
  await page.getByRole("button", { name: "Giorno successivo" }).click();
  await expect(toggle).toContainText("1 di 3");
  await toggle.click();

  // Un solo lavoro rimesso: la casella della fascia diventa "a metà".
  await page.locator(".ag-rt-stop", { hasText: "Giulia Bianchi" }).click();
  await expect(page.getByRole("checkbox", { name: "Tutta la fascia Mattina · 08:00–13:00" })).toHaveJSProperty("indeterminate", true);
  await expect(page.locator("ol").getByText(/Giulia Bianchi/)).toBeVisible();
  await page.getByRole("button", { name: "Rimetti tutte le tappe" }).click();
  await expect(toggle).toContainText("3 di 3");
  await page.context().close();
});
