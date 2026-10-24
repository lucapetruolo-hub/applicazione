import { expect, test, type APIRequestContext } from "@playwright/test";
import { e2eData } from "../fixtures/data";
import { API_URL } from "../fixtures/env";

/**
 * Settimana tipo in tre passi, scelta dall'utente (proposta A,
 * docs/CHANGELOG.md §323): salvata vale per tutti i mesi, oppure per un
 * mese solo scelto accanto a "Salva la settimana".
 */
type Slot = { date: string | null; startTime: string; endTime: string };

async function mySlots(request: APIRequestContext): Promise<Slot[]> {
  const res = await request.get(`${API_URL}/professionals/me/availability`, { headers: { Authorization: `Bearer ${e2eData().token}` } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { slots: Slot[] }).slots;
}

const weekday = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

test("salvata, la settimana riempie i prossimi giorni senza scegliere un mese", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Cambia i dati: una volta sola.");
  const before = await mySlots(request);
  await page.goto("/dashboard/agenda?tab=orari");
  const week = page.getByRole("region", { name: "La tua settimana" });
  await expect(week.getByRole("button", { name: "Venerdì" })).toHaveAttribute("aria-pressed", "true");
  await expect(week.getByRole("button", { name: /^Applica/ })).toHaveCount(0);

  // 1. Anche il sabato. 2. Solo la mattina. 3. Il venerdì fino alle 12.
  await week.getByRole("button", { name: "Sabato" }).click();
  await expect(week.getByRole("button", { name: "Sabato" })).toHaveAttribute("aria-pressed", "true");
  await week.getByRole("radio", { name: /Solo la mattina/ }).check();
  await week.getByRole("button", { name: "Aggiungi un giorno diverso" }).click();
  await week.getByRole("group", { name: "Quale giorno?" }).getByRole("button", { name: "Venerdì" }).click();
  await week.getByLabel("Venerdì: fine 1° orario").fill("12:00");
  await week.getByRole("button", { name: "Fatto" }).click();
  await expect(week).toContainText("Venerdì · 8–12");

  await week.getByRole("button", { name: "Salva la settimana" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settimana salvata" })).toBeVisible();
  await expect(week).toContainText("Salvata, vale per tutti i mesi");

  const after = (await mySlots(request)).filter((s) => s.date && !before.some((b) => b.date === s.date));
  const saturdays = after.filter((s) => weekday(s.date!) === 6);
  const fridays = after.filter((s) => weekday(s.date!) === 5);
  const sundays = after.filter((s) => weekday(s.date!) === 0);
  // Più di un mese avanti: otto sabati nei prossimi 63 giorni.
  expect(saturdays.length).toBeGreaterThanOrEqual(8);
  expect(saturdays.every((s) => s.startTime === "08:00" && s.endTime === "13:00")).toBe(true);
  expect(fridays.every((s) => s.startTime === "08:00" && s.endTime === "12:00")).toBe(true);
  expect(sundays).toHaveLength(0);
  expect(after.some((s) => s.startTime === "14:00")).toBe(false);

  // Riaprendo la pagina i tre passi mostrano la settimana salvata.
  await page.reload();
  await expect(week.getByRole("radio", { name: /Solo la mattina/ })).toBeChecked();
  await expect(week).toContainText("Venerdì · 8–12");

  // Rimette tutto com'era per le altre prove: settimana vuota.
  const res = await request.put(`${API_URL}/agenda/week-template`, {
    headers: { Authorization: `Bearer ${e2eData().token}`, "Content-Type": "application/json" },
    data: { days: [[], [], [], [], [], [], []] },
  });
  expect(res.ok()).toBe(true);
  // Restano solo i giorni con un lavoro già fissato: quelli non si toccano.
  const bookingDates = new Set([...e2eData().bookings.map((b) => b.wallClock.slice(0, 10)), "2026-11-03"]);
  const left = (await mySlots(request)).filter((s) => s.date && !before.some((b) => b.date === s.date));
  expect(left.filter((s) => !bookingDates.has(s.date!))).toEqual([]);
});

test("orari sbagliati: l'avviso spiega cosa non va e non si salva", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "computer-tokyo", "Basta una volta, da computer.");
  await page.goto("/dashboard/agenda?tab=orari");
  const week = page.getByRole("region", { name: "La tua settimana" });
  // Da computer accanto ai passi c'è la settimana come la vedono i clienti.
  await expect(week.getByRole("heading", { name: "Come la vedono i clienti" })).toBeVisible();
  await week.getByLabel("Tutti i giorni: fine 1° orario").fill("07:00");
  await expect(week.getByRole("alert")).toHaveText("L'orario di fine deve essere dopo quello di inizio.");
  await expect(week.getByRole("button", { name: "Salva la settimana" })).toBeDisabled();
});

test("salvata per un mese solo, riempie solo quel mese", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Cambia i dati: una volta sola.");
  const before = await mySlots(request);
  await page.goto("/dashboard/agenda?tab=orari");
  const week = page.getByRole("region", { name: "La tua settimana" });
  await week.getByRole("button", { name: "Domenica" }).click();
  // Il secondo mese dell'elenco: sempre nel futuro, qualunque sia oggi.
  const scope = week.getByRole("combobox", { name: "Vale per" });
  const option = scope.locator("option").nth(2);
  const month = (await option.getAttribute("value"))!;
  await scope.selectOption(month);
  await week.getByRole("button", { name: "Salva la settimana" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settimana salvata a" })).toBeVisible();
  await expect(week).toContainText("Salvata per");

  const added = (await mySlots(request)).filter((s) => s.date && !before.some((b) => b.date === s.date));
  expect(added.length).toBeGreaterThan(0);
  expect(added.every((s) => s.date!.startsWith(month))).toBe(true);
  expect(added.some((s) => weekday(s.date!) === 0)).toBe(true);
});
