import { expect, test } from "@playwright/test";
import { BOOKING_CASES } from "../fixtures/cases";
import { e2eData } from "../fixtures/data";

/**
 * Ora legale e fuso orario (docs/CHANGELOG.md §292): lo stesso appuntamento
 * deve mostrare la stessa ora italiana su un telefono in Italia, a New York
 * e a Tokyo, prima e dopo i cambi d'ora del 25/10/2026 e del 28/03/2027.
 */
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

for (const item of BOOKING_CASES) {
  test(`appuntamento del ${item.wallClock} (${item.label}) all'ora italiana`, async ({ page }) => {
    const booking = e2eData().bookings.find((b) => b.wallClock === item.wallClock)!;
    const [date, time] = booking.wallClock.split(" ") as [string, string];
    const [, month, day] = date.split("-").map(Number) as [number, number, number];
    await page.goto(`/dashboard/agenda?booking=${booking.id}`);
    const panel = page.getByRole("dialog", { name: /Appuntamento con/ });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`${day} ${MONTHS[month - 1]} · ${time}–`);
    // Anche il blocco nella griglia del giorno è alla stessa ora.
    await expect(page.getByRole("button", { name: new RegExp(`${time}–`) }).first()).toBeVisible();
  });
}

test("a mezzanotte e mezza in Italia \"oggi\" è già il giorno dopo, anche se il telefono è a New York", async ({ page }) => {
  // 25/10/2026 23:30 UTC = 26/10 00:30 in Italia, ancora 25/10 a New York e in UTC.
  await page.clock.setFixedTime(new Date("2026-10-25T23:30:00Z"));
  await page.goto("/dashboard/agenda");
  // Il giorno di oggi è evidenziato sia nel mese piccolo sia nell'intestazione dei giorni.
  const today = page.locator("button.today").filter({ visible: true });
  await expect(today.first()).toBeVisible();
  for (const button of await today.all()) await expect(button).toContainText("26");
});

test("il lavoro esterno compare all'ora italiana", async ({ page }) => {
  const { externalJob } = e2eData();
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("button", { name: /Condominio Aurora.*17:00–18:00/ }).first()).toBeVisible();
  expect(externalJob.wallClock).toBe("2026-10-26 17:00");
});

test("un lavoro su più giorni compare ogni giorno con lo stesso orario (M1)", async ({ page }) => {
  // Mercoledì 4 novembre 2026, 10:00 in Italia: il secondo dei tre giorni.
  await page.clock.setFixedTime(new Date("2026-11-04T09:00:00Z"));
  await page.goto("/dashboard/agenda");
  const event = page.getByRole("button", { name: /Paolo Verdi, 08:00–17:00/ }).filter({ visible: true }).first();
  await expect(event).toBeVisible();
  await expect(event).toContainText("Giorno 2 di 3");

  await page.goto(`/dashboard/agenda?booking=${e2eData().multiDayBookingId}`);
  await expect(page.getByRole("dialog", { name: /Appuntamento con/ })).toContainText("Dal 3 al 5 novembre · ogni giorno 08:00–17:00");
});
