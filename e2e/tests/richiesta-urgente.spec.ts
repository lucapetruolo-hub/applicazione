import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * "Quando ti serve?" nella richiesta di preventivo (docs/CHANGELOG.md §344):
 * si sceglie una volta sola, al primo passo (prova con persone simulate,
 * docs/changelog/2026-11-08-prova-persone-simulate.md); tempi dell'inoltro e
 * pulsante del riepilogo seguono la scelta ("Oggi" = urgente), numero dei
 * destinatari, annuncio al lettore di schermo, /urgente già "Oggi" senza
 * domanda e richiesta inviata con tempi e urgenza giusti. Il numero dei
 * destinatari è simulato per avere valori fissi.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const DESCRIPTION = encodeURIComponent("Perdita d'acqua sotto il lavandino della cucina.");
const DIRECT = `/preventivo?categoria=idraulico&professionista=pro-prova&nomeProfessionista=Mario%20Rossi&modalita=ONLINE&descrizione=${DESCRIPTION}`;
const GENERAL = `/preventivo?categoria=idraulico&citta=Latina&modalita=ONLINE&descrizione=${DESCRIPTION}`;

async function mockReach(page: Page) {
  await page.route(`${API_URL}/guided-requests/reach**`, (route) =>
    route.fulfill({ json: route.request().url().includes("professionista=") ? { standard: 8, urgent: 4 } : { standard: 12, urgent: 5 } }),
  );
}

/** "Oggi" e gli altri: radio dentro il gruppo "Quando ti serve?" del primo passo. */
const timing = (page: Page, name: "Oggi" | "In settimana" | "Con calma") =>
  page.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name });

async function goToSummary(page: Page) {
  await page.getByText("Avanti", { exact: true }).click();
  await page.getByText("Avanti", { exact: true }).click();
  await expect(page.getByRole("group", { name: "Opzioni di invio" })).toBeVisible();
}

async function backToFirstStep(page: Page) {
  await page.getByText("Indietro", { exact: true }).click();
  await page.getByText("Indietro", { exact: true }).click();
}

test("si sceglie al primo passo, il riepilogo segue la scelta senza richiederla", async ({ page }) => {
  await mockReach(page);
  await page.goto(DIRECT);
  // Nessuna scelta già fatta, ma si sa cosa vuol dire "Oggi".
  await expect(timing(page, "Oggi")).not.toBeChecked();
  await expect(page.getByText("Oggi solo se serve entro 24 ore.")).toBeVisible();
  // Senza una scelta non si va avanti, e il cursore va sulla domanda.
  await page.getByText("Avanti", { exact: true }).click();
  await expect(page.getByText("Scegli quando ti serve.")).toBeVisible();
  await expect(timing(page, "Oggi")).toBeFocused();
  await timing(page, "Oggi").check();
  await goToSummary(page);

  const forward = page.getByRole("switch", { name: "Inoltra se non risponde" });
  await expect(page.getByRole("group", { name: "Quando ti serve?" })).toHaveCount(0);
  await expect(page.locator(".guided-recap")).toContainText("Oggi");
  // L'ora precisa dell'inoltro (E6-11): 60 minuti con "Oggi", 6 ore con calma.
  const clock = /entro (le|domani alle|il .+ alle) \d{2}:\d{2}/;
  await expect(forward).toContainText(clock);
  const urgentText = await forward.textContent();
  await expect(forward).toContainText("altri 4 professionisti");
  await expect(page.getByRole("button", { name: /Invia richiesta urgente/ })).toBeVisible();

  await backToFirstStep(page);
  await expect(timing(page, "Oggi")).toBeChecked();
  await timing(page, "Con calma").check();
  await expect(page.getByRole("status").filter({ hasText: "Quando: Con calma." })).toContainText("6 ore");
  await goToSummary(page);
  await expect(forward).toContainText(clock);
  await expect(forward).not.toHaveText(urgentText ?? "");
  await expect(forward).toContainText("altri 8 professionisti");
  await expect(page.getByRole("button", { name: /Invia richiesta urgente/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Invia richiesta/ })).toBeVisible();
});

test("richiesta generale: a quanti arriva, annuncio al lettore di schermo, accessibilità", async ({ page }) => {
  await mockReach(page);
  await page.goto(GENERAL);
  await timing(page, "In settimana").check();
  await goToSummary(page);
  await expect(page.getByText("Arriva subito a 12 professionisti di Idraulico")).toBeVisible();

  await backToFirstStep(page);
  await timing(page, "Oggi").check();
  await expect(page.getByRole("group", { name: "Quando ti serve?" })).toContainText("5 professionisti");
  await expect(page.getByRole("status").filter({ hasText: "Quando: Oggi, urgente." })).toContainText("Arriva a 5 professionisti");
  await goToSummary(page);
  await expect(page.getByText("Arriva subito a 5 professionisti di Idraulico")).toBeVisible();

  const results = await new AxeBuilder({ page }).include(".guided-options").include(".guided-next").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("/urgente: è già \"Oggi\" e la domanda non c'è", async ({ page }) => {
  await page.goto("/urgente?categoria=idraulico");
  await expect(page.getByText("Richiesta urgente: arriva subito ai professionisti della tua zona")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Richiesta urgente");
  await expect(page.getByRole("group", { name: "Quando ti serve?" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Con calma");
});

test("la richiesta inviata ha i tempi e l'urgenza scelti al primo passo", async ({ page }) => {
  await mockReach(page);
  // Cliente già entrato: l'invio parte senza la finestra di accesso.
  await page.route(`${API_URL}/auth/me`, (route) =>
    route.fulfill({ json: { id: "cliente-prova", role: "CLIENT", email: "cliente@prova.it", name: "Giulia", surname: "Bianchi", emailVerifiedAt: new Date().toISOString() } }),
  );
  const sent: Record<string, unknown>[] = [];
  await page.route(`${API_URL}/guided-requests`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sent.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 503, json: { message: "Prova: richiesta non salvata." } });
  });
  await page.addInitScript(() => window.localStorage.setItem("professionisti_token", "token-di-prova"));

  await page.goto(GENERAL);
  await timing(page, "Oggi").check();
  await goToSummary(page);
  await page.getByRole("button", { name: /Invia richiesta urgente/ }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ isUrgent: true, timing: "TODAY", categorySlug: "idraulico" });
});
