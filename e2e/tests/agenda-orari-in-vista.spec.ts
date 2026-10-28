import { expect, test } from "@playwright/test";

/**
 * Agenda con gli orari subito in vista (docs/changelog/2026-10-28-agenda-orari-in-vista.md):
 * un tocco su un orario vuoto aggiunge un lavoro a quell'ora, e da computer
 * l'agenda si riapre sull'ultima vista scelta.
 */
test("un tocco su un orario vuoto apre Aggiungi lavoro con giorno e ora già scritti", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono.");
  // Domenica: si apre la settimana che comincia domani, da lunedì 26 a domenica 1.
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  await page.goto("/dashboard/agenda");
  const sunday = page.locator(".ag-col").nth(6);
  await expect(sunday).toBeVisible();
  await sunday.click({ position: { x: 10, y: 5 } });
  const modal = page.getByRole("dialog", { name: "Aggiungi un tuo lavoro" });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("Data")).toHaveValue("2026-11-01");
  const start = await modal.getByLabel("Ora di inizio").inputValue();
  expect(start).toMatch(/^\d{2}:(00|30)$/);
  const hour = Number(start.slice(0, 2));
  await expect(modal.getByLabel("Ora di fine")).toHaveValue(`${String(hour + 1).padStart(2, "0")}${start.slice(2)}`);
});

test("da computer l'agenda si riapre sull'ultima vista scelta", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "computer-tokyo", "Riguarda il computer.");
  await page.goto("/dashboard/agenda");
  const views = page.getByRole("group", { name: "Vista" });
  await views.getByRole("button", { name: "Giorno" }).click();
  await page.reload();
  await expect(views.getByRole("button", { name: "Giorno" })).toHaveAttribute("aria-pressed", "true");
  await views.getByRole("button", { name: "Settimana" }).click();
  await page.reload();
  await expect(views.getByRole("button", { name: "Settimana" })).toHaveAttribute("aria-pressed", "true");
});
