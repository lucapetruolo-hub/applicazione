import { expect, test } from "@playwright/test";

/**
 * Campo ora unico del sito (docs/changelog/2026-11-10-campo-orario-scrivibile.md):
 * l'ora si scrive a mano ("930" diventa 09:30) oppure si sceglie con la
 * rotella, al computer sotto il campo e sul telefono dal basso dello
 * schermo. Esc chiude solo la rotella, non la finestra della fascia.
 */
async function openSlot(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/agenda?tab=orari");
  await page.getByRole("button", { name: "Aggiungi fascia oraria" }).first().click();
  const modal = page.getByRole("dialog", { name: "Imposta fascia oraria" });
  await expect(modal).toBeVisible();
  return modal;
}

test("l'ora si scrive a mano, anche senza i due punti", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Bastano un telefono e un computer.");
  const modal = await openSlot(page);
  const start = modal.getByLabel("Ora di inizio");
  const end = modal.getByLabel("Ora di fine");

  await start.fill("");
  await start.pressSequentially("930");
  await expect(start).toHaveValue("9:30");
  await end.click();
  await expect(start).toHaveValue("09:30");

  await end.fill("");
  await end.pressSequentially("1810");
  await expect(end).toHaveValue("18:10");

  // Frecce: 5 minuti alla volta.
  await end.press("ArrowUp");
  await expect(end).toHaveValue("18:15");

  // Un'ora che non esiste torna all'ultima buona.
  await start.fill("25:00");
  await end.click();
  await expect(start).toHaveValue("09:30");

  // "9" vuol dire le 9 in punto.
  await start.fill("9");
  await start.press("Tab");
  await expect(start).toHaveValue("09:00");
});

test("la rotella sceglie ore e minuti e Esc chiude solo lei", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Bastano un telefono e un computer.");
  const modal = await openSlot(page);
  const start = modal.getByLabel("Ora di inizio");
  await start.fill("08:00");
  await start.press("Tab");

  await modal.getByRole("button", { name: "Scegli con la rotella" }).first().click();
  const wheel = page.getByRole("dialog", { name: "Rotella dell'ora" });
  await expect(wheel).toBeVisible();
  const hours = wheel.getByRole("listbox", { name: "Ore" });
  const minutes = wheel.getByRole("listbox", { name: "Minuti" });
  await expect(hours.getByRole("option", { selected: true })).toHaveText("08");

  // Un tocco sul numero lo porta al centro.
  await hours.getByRole("option", { name: "10" }).click();
  await expect(start).toHaveValue("10:00");
  // Minuti di 5 in 5, non solo 00/15/30/45.
  await minutes.getByRole("option", { name: "35" }).click();
  await expect(start).toHaveValue("10:35");

  // Da tastiera: freccia giù sull'elenco delle ore.
  await hours.focus();
  await page.keyboard.press("ArrowDown");
  await expect(start).toHaveValue("11:35");
  await expect(hours.getByRole("option", { selected: true })).toHaveText("11");

  await page.keyboard.press("Escape");
  await expect(wheel).toBeHidden();
  await expect(modal).toBeVisible();
  await expect(start).toBeFocused();

  // Riaperta, "Fatto" la chiude.
  await modal.getByRole("button", { name: "Scegli con la rotella" }).first().click();
  await page.getByRole("button", { name: "Fatto" }).click();
  await expect(wheel).toBeHidden();
  await expect(start).toHaveValue("11:35");

  if (testInfo.project.name === "computer-tokyo") {
    // Al computer basta un clic nel campo, e la rotella sta sotto il campo.
    await start.click();
    await expect(wheel).toBeVisible();
    const field = (await start.boundingBox())!;
    const panel = (await wheel.boundingBox())!;
    expect(panel.y).toBeGreaterThan(field.y + field.height - 1);
    // La rotella del mouse gira le ore e si ferma su un numero intero.
    const hoursBox = (await hours.boundingBox())!;
    await page.mouse.move(hoursBox.x + hoursBox.width / 2, hoursBox.y + hoursBox.height / 2);
    await page.mouse.wheel(0, 80);
    await expect(start).toHaveValue("13:35");
    await page.keyboard.press("Escape");
  } else {
    // Sul telefono la rotella sale dal basso e prende tutta la larghezza.
    await modal.getByRole("button", { name: "Scegli con la rotella" }).first().click();
    const panel = (await wheel.boundingBox())!;
    const view = page.viewportSize()!;
    expect(Math.round(panel.y + panel.height)).toBe(view.height);
    expect(Math.round(panel.width)).toBe(view.width);
  }
});
