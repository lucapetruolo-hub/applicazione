import { expect, test } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * "Oggi" con il meteo dei prossimi giorni e i lavori raggruppati per giorno
 * (docs/CHANGELOG.md §333): i lavori aggiunti a mano compaiono e si aprono in
 * agenda, un giorno del meteo apre l'agenda su quel giorno. Il meteo è
 * simulato: la prova non dipende da Open-Meteo.
 */
test("un lavoro aggiunto a mano compare in Oggi e si apre in agenda", async ({ page }) => {
  // Lunedì 26 ottobre, 08:00 in Italia: oggi ci sono due prenotazioni e il lavoro aggiunto a mano.
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00Z"));
  await page.goto("/dashboard");
  await expect(page.locator(".today-day-head").first()).toContainText("3 lavori");
  // "Naviga" diretto sul lavoro di oggi (§352).
  await expect(page.getByRole("link", { name: "Naviga verso Via Isonzo 40, Latina" })).toHaveAttribute("href", /google\.com\/maps\/dir\/.*Via\+Isonzo\+40/);
  await page.getByRole("link", { name: /Condominio Aurora/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/agenda\?esterno=/);
  const dialog = page.getByRole("dialog", { name: "Modifica il lavoro" });
  await expect(dialog.getByLabel(/Nome cliente/)).toHaveValue("Condominio Aurora");
});

test("toccando un giorno del meteo l'agenda si apre su quel giorno", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T07:00:00Z"));
  const forecast = (date: string, condition: string) => ({ date, weather: { date, condition, tempMax: 18, tempMin: 9, place: "Latina", away: false } });
  await page.route(`${API_URL}/agenda/days-ahead`, (route) =>
    route.fulfill({ json: [forecast("2026-11-02", "clear"), forecast("2026-11-03", "rain"), forecast("2026-11-04", "partly")] }),
  );
  await page.goto("/dashboard");
  const strip = page.getByRole("list", { name: "Meteo dei prossimi giorni" });
  await expect(strip.getByRole("img", { name: "Pioggia" })).toBeVisible();
  await strip.getByRole("link", { name: /mercoledì/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/agenda\?giorno=2026-11-04/);
  // Il 4 novembre c'è il lavoro su più giorni, 08:00–17:00.
  await expect(page.getByRole("button", { name: /08:00–17:00/ }).first()).toBeVisible();
});

test("le richieste da rispondere stanno in cima, sopra meteo e lavori", async ({ page }) => {
  // §403: "Da rispondere ora" prima di tutto; senza richieste resta sotto i lavori.
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00Z"));
  const lead = {
    id: "lead-in-cima", status: "PENDING", declineNote: null, professionalNote: null, priceEurCents: 0,
    createdAt: "2026-10-26T06:00:00Z", updatedAt: "2026-10-26T06:00:00Z", expiresAt: null, forwardAt: "2026-10-26T13:00:00Z",
    respondUntil: "2026-10-29T18:00:00Z", competitors: { responded: 0, total: 3 }, quote: null,
    guidedRequest: { id: "gr-in-cima", categoryLabel: "Idraulico", city: "Latina", description: "Perdita sotto il lavello", isUrgent: false, withdrawnByClient: false, clientName: "Giulia" },
  };
  await page.route(`${API_URL}/professionals/me/leads`, (route) => route.fulfill({ json: [lead] }));
  await page.goto("/dashboard");
  const toAnswer = page.getByText("Da rispondere ora", { exact: true });
  const days = page.getByText("Oggi e domani", { exact: true });
  await expect(page.getByRole("link", { name: /Perdita sotto il lavello/ })).toBeVisible();
  await expect(days).toBeVisible();
  const [top, below] = [await toAnswer.boundingBox(), await days.boundingBox()];
  expect(top!.y).toBeLessThan(below!.y);
});
