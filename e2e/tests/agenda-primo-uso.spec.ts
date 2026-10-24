import { expect, test } from "@playwright/test";

/**
 * Problemi trovati nel test dei 5 compiti fatto come un professionista che
 * apre l'app per la prima volta (docs/CHANGELOG.md §311, T1-T12): ogni prova
 * fallisce sul codice di prima.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "computer-tokyo", "Riguarda il telefono.");
});

test("T2 e T3: in Oggi il prossimo lavoro sta in cima e apre l'appuntamento", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T07:30:00Z"));
  await page.goto("/dashboard");
  const next = page.getByRole("link", { name: /Giulia Bianchi/ }).first();
  await expect(next).toBeVisible();
  // Prima di "Completa il profilo" e senza scorrere.
  const nextBox = (await next.boundingBox())!;
  expect(nextBox.y + nextBox.height).toBeLessThan(page.viewportSize()!.height);
  await next.click();
  await expect(page.getByRole("dialog", { name: /Appuntamento con Giulia Bianchi/ })).toBeVisible();
});

test("T4: la domenica sera domani è nella striscia dei giorni", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  await page.goto("/dashboard/agenda");
  await page.getByRole("group", { name: "Giorni della settimana" }).first().getByRole("button", { name: /Lun 26/ }).click();
  await expect(page.getByRole("button", { name: /Giulia Bianchi ?, 09:00–10:30/ }).first()).toBeVisible();
});

test("T1: chiudere un giorno sta in cima a Orari di lavoro e basta la data", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  await page.goto("/dashboard/agenda?tab=orari");
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.first()).toHaveText("Chiudi un giorno o le ferie");
  // Nella settimana tipo nessun "Chiudi" che sembri chiudere un giorno preciso.
  await expect(page.getByRole("button", { name: "Chiudi", exact: true })).toHaveCount(0);
  // Settimana in tre passi (§321): i giorni si accendono e si spengono, nessun "Chiudi".
  await expect(page.getByRole("region", { name: "La tua settimana" }).getByRole("button", { name: "Venerdì" })).toHaveAttribute("aria-pressed", /true|false/);
});

test("T9 e T11: il tasto per aggiungere un lavoro ha la scritta; Lavoro completato solo dal giorno del lavoro", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("button", { name: "Aggiungi lavoro" })).toContainText("Aggiungi lavoro");
  await page.getByRole("group", { name: "Giorni della settimana" }).first().getByRole("button", { name: /Lun 26/ }).click();
  await page.getByRole("button", { name: /Giulia Bianchi ?, 09:00–10:30/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /Appuntamento con/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Lavoro completato" })).toHaveCount(0);
});

test("frecce della striscia: giorno prima e dopo anche in Giorno per giorno (§319)", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-24T10:00:00Z"));
  await page.goto("/dashboard/agenda?tab=orari");
  const section = page.getByRole("heading", { name: "Giorno per giorno" }).locator("xpath=ancestor::div[2]");
  await section.getByRole("button", { name: "Giorno", exact: true }).click();
  const strip = section.getByRole("group", { name: "Giorni della settimana" });
  await expect(strip.getByRole("button", { pressed: true })).toContainText("24");
  for (let i = 0; i < 7; i++) await section.getByRole("button", { name: "Giorno successivo" }).click();
  // Sette giorni dopo la striscia è passata ai sette successivi: da sabato 31 a venerdì 6.
  await expect(strip.getByRole("button", { pressed: true })).toContainText("31");
  await expect(strip.getByRole("button").last()).toContainText("6");
  await section.getByRole("button", { name: "Giorno precedente" }).click();
  await expect(strip.getByRole("button", { pressed: true })).toContainText("30");
});
