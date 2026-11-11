import { expect, test } from "@playwright/test";

/**
 * Campo data unico del sito (docs/changelog/2026-11-11-campo-data-scrivibile.md):
 * la data si scrive a mano ("251126" diventa 25/11/2026) oppure si sceglie dal
 * calendarietto, al computer sotto il campo e sul telefono dal basso dello
 * schermo. Si prova nella finestra "Aggiungi un tuo lavoro" dell'agenda.
 */
async function openJob(page: import("@playwright/test").Page) {
  // Domenica 25 ottobre 2026: si apre la settimana che comincia domani.
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  await page.goto("/dashboard/agenda");
  const sunday = page.locator(".ag-col").nth(6);
  await expect(sunday).toBeVisible();
  await sunday.click({ position: { x: 10, y: 5 } });
  const modal = page.getByRole("dialog", { name: "Aggiungi un tuo lavoro" });
  await expect(modal).toBeVisible();
  return modal;
}

test("la data si scrive a mano, con le barre messe da sole", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Bastano un telefono e un computer.");
  const modal = await openJob(page);
  const date = modal.getByLabel("Data");
  const start = modal.getByLabel("Ora di inizio");

  await date.fill("");
  await date.pressSequentially("251126");
  await expect(date).toHaveValue("25/11/26");
  await start.click();
  await expect(date).toHaveValue("25/11/2026");

  // Senza anno vale quest'anno; frecce di un giorno.
  await date.fill("3/12");
  await date.press("Tab");
  await expect(date).toHaveValue("03/12/2026");
  await date.press("ArrowUp");
  await expect(date).toHaveValue("04/12/2026");

  // Una data che non esiste lo dice sotto il campo.
  await date.fill("31/02/2027");
  await start.click();
  await expect(modal.getByRole("alert")).toHaveText(/non esiste/);
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await date.fill("02/03/2027");
  await expect(modal.getByRole("alert")).toHaveCount(0);
});

test("il calendarietto sceglie il giorno, anche da tastiera", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Bastano un telefono e un computer.");
  const modal = await openJob(page);
  const date = modal.getByLabel("Data");
  await date.fill("01/11/2026");
  await date.press("Tab");

  await modal.getByRole("button", { name: "Scegli dal calendario" }).click();
  const cal = page.getByRole("dialog", { name: "Calendario" });
  await expect(cal).toBeVisible();
  await expect(cal.getByRole("combobox", { name: "Mese" })).toHaveValue("11");
  await expect(cal.getByRole("button", { name: "domenica 1 novembre 2026" })).toHaveAttribute("aria-pressed", "true");

  // Mese dopo, poi un tocco sul giorno: si chiude e la data è scritta.
  await cal.getByRole("button", { name: "Mese dopo" }).click();
  await cal.getByRole("button", { name: "venerdì 18 dicembre 2026" }).click();
  await expect(cal).toBeHidden();
  await expect(date).toHaveValue("18/12/2026");
  await expect(date).toBeFocused();

  // Da tastiera: frecce sui giorni, Invio sceglie; Esc chiude solo il calendario.
  await modal.getByRole("button", { name: "Scegli dal calendario" }).click();
  await cal.getByRole("button", { name: "venerdì 18 dicembre 2026" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(cal.getByRole("button", { name: "venerdì 25 dicembre 2026" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(date).toHaveValue("25/12/2026");
  await modal.getByRole("button", { name: "Scegli dal calendario" }).click();
  await page.keyboard.press("Escape");
  await expect(cal).toBeHidden();
  await expect(modal).toBeVisible();

  if (testInfo.project.name === "computer-tokyo") {
    await date.click();
    await expect(cal).toBeVisible();
    const field = (await date.boundingBox())!;
    const panel = (await cal.boundingBox())!;
    expect(panel.y > field.y + field.height - 1 || panel.y + panel.height < field.y + 1).toBe(true);
  } else {
    await modal.getByRole("button", { name: "Scegli dal calendario" }).click();
    const panel = (await cal.boundingBox())!;
    const view = page.viewportSize()!;
    expect(Math.round(panel.y + panel.height)).toBe(view.height);
  }
});

test("chiudere dei giorni: date passate spente nel calendarietto e avviso se scritte", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono.");
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  await page.goto("/dashboard/agenda?tab=orari");
  const from = page.getByRole("textbox", { name: "Dal", exact: true });
  await from.scrollIntoViewIfNeeded();
  await from.fill("20/10/2026");
  await from.press("Tab");
  await expect(page.getByRole("alert").filter({ hasText: "dal 25/10/2026 in poi" })).toBeVisible();
  await from.locator("xpath=..").getByRole("button", { name: "Scegli dal calendario" }).click();
  const cal = page.getByRole("dialog", { name: "Calendario" });
  await expect(cal.getByRole("button", { name: "sabato 24 ottobre 2026" })).toBeDisabled();
  await cal.getByRole("button", { name: "martedì 27 ottobre 2026" }).click();
  await expect(from).toHaveValue("27/10/2026");
  await expect(page.getByRole("alert").filter({ hasText: "in poi" })).toHaveCount(0);
});
