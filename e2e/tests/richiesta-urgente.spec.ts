import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * "Urgente" nella richiesta di preventivo (docs/CHANGELOG.md §340):
 * stesso stato al primo passo e nel riepilogo, tempi dell'inoltro e
 * pulsante che seguono la scelta, numero dei destinatari, annuncio al
 * lettore di schermo, /urgente coerente e richiesta inviata con l'urgenza
 * giusta. Il numero dei destinatari è simulato per avere valori fissi.
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

async function goToSummary(page: Page) {
  await page.getByText("Avanti", { exact: true }).click();
  await page.getByText("Avanti", { exact: true }).click();
  await expect(page.getByRole("group", { name: "Opzioni di invio" })).toBeVisible();
}

test("stesso stato nei due passi, tempi e pulsante aggiornati", async ({ page }) => {
  await mockReach(page);
  await page.goto(DIRECT);
  const firstStep = page.getByRole("switch", { name: "È urgente?" });
  await firstStep.click();
  await expect(firstStep).toHaveAttribute("aria-checked", "true");
  await goToSummary(page);

  const urgent = page.getByRole("switch", { name: "Urgente" });
  const forward = page.getByRole("switch", { name: "Inoltra se non risponde" });
  await expect(urgent).toHaveAttribute("aria-checked", "true");
  await expect(forward).toContainText("entro 60 minuti");
  await expect(forward).toContainText("altri 4 professionisti");
  await expect(page.getByRole("button", { name: /Invia richiesta urgente/ })).toBeVisible();

  await urgent.click();
  await expect(urgent).toHaveAttribute("aria-checked", "false");
  await expect(forward).toContainText("entro 6 ore");
  await expect(forward).toContainText("altri 8 professionisti");
  await expect(page.getByRole("button", { name: /Invia richiesta urgente/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Invia richiesta/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Urgente disattivato" })).toContainText("6 ore");

  await page.getByText("Indietro", { exact: true }).click();
  await page.getByText("Indietro", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "È urgente?" })).toHaveAttribute("aria-checked", "false");
});

test("richiesta generale: a quanti arriva, annuncio al lettore di schermo, accessibilità", async ({ page }) => {
  await mockReach(page);
  await page.goto(GENERAL);
  await goToSummary(page);
  await expect(page.getByText("Arriva subito a 12 professionisti di Idraulico")).toBeVisible();

  await page.getByRole("switch", { name: "Urgente" }).click();
  await expect(page.getByText("Arriva subito a 5 professionisti di Idraulico")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Urgente" })).toContainText("5 professionisti");
  await expect(page.getByRole("status").filter({ hasText: "Urgente attivo" })).toContainText("Arriva a 5 professionisti");

  const results = await new AxeBuilder({ page }).include(".guided-options").include(".guided-next").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("/urgente: spegnendo l'urgenza la pagina non parla più di urgenza", async ({ page }) => {
  await page.goto("/urgente?categoria=idraulico");
  await expect(page.getByText("Richiesta urgente: arriva subito ai professionisti della tua zona")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Richiesta urgente");
  const toggle = page.getByRole("switch", { name: "È urgente?" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await toggle.click();
  await expect(page.getByText("Richiesta urgente: arriva subito")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Richiedi un preventivo gratuito");
  await expect(page.locator("body")).not.toContainText("disponibili ora");
});

test("la richiesta inviata ha l'urgenza scelta nel riepilogo", async ({ page }) => {
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
  await goToSummary(page);
  await page.getByRole("switch", { name: "Urgente" }).click();
  await page.getByRole("button", { name: /Invia richiesta urgente/ }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ isUrgent: true, categorySlug: "idraulico" });
});
