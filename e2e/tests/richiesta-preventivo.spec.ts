import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * Richiesta di preventivo (docs/CHANGELOG.md §319): il campo indirizzo non
 * cambia il modulo mentre si scrive quando i suggerimenti di Google non
 * funzionano, si usa con un lettore di schermo, e le tessere delle categorie
 * compaiono già in ordine. I servizi di Google sono simulati: la prova
 * controlla cosa vede il cliente in ogni caso.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SUGGESTIONS = [
  { id: "ChIJprova000000001", main: "Via Roma, 5", secondary: "Latina LT, Italia" },
  { id: "ChIJprova000000002", main: "Via Romagnoli, 12", secondary: "Latina LT, Italia" },
];

async function mockAddress(page: Page, options: { available: boolean; suggestions: "ok" | "down" }) {
  await page.route(`${API_URL}/address/status`, (route) => route.fulfill({ json: { available: options.available } }));
  await page.route(`${API_URL}/address/suggestions**`, (route) =>
    options.suggestions === "ok"
      ? route.fulfill({ json: SUGGESTIONS })
      : route.fulfill({ status: 503, json: { message: "Suggerimenti di indirizzo non disponibili." } }),
  );
}

/** Passo 1 compilato, "A domicilio", poi Avanti fino a "Dove". */
async function goToAddressStep(page: Page) {
  await page.goto("/preventivo");
  await page.locator(".cat-tile", { hasText: "Idraulico" }).first().click();
  await page.getByLabel("Descrivi il lavoro").fill("Perdita sotto il lavandino della cucina");
  const home = page.getByText("A domicilio", { exact: true }).first();
  if (await home.count()) await home.click();
  await page.getByText("Avanti", { exact: true }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toBeVisible();
}

test("suggerimenti non disponibili: i campi separati ci sono già all'apertura", async ({ page }) => {
  await mockAddress(page, { available: false, suggestions: "down" });
  await goToAddressStep(page);
  await expect(page.getByLabel("Via o piazza")).toBeVisible();
  await expect(page.getByPlaceholder("Città")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Indirizzo/ })).toHaveCount(0);
});

test("Google smette di rispondere mentre si scrive: il testo resta e si continua a scrivere", async ({ page }) => {
  await mockAddress(page, { available: true, suggestions: "down" });
  await goToAddressStep(page);
  const address = page.getByRole("combobox", { name: /Indirizzo/ });
  await address.click();
  await address.pressSequentially("Via Rom", { delay: 40 });
  const street = page.getByLabel("Via o piazza");
  await expect(street).toHaveValue("Via Rom");
  await expect(street).toBeFocused();
  await expect(page.getByText("I suggerimenti non sono disponibili")).toBeVisible();
});

test("lettore di schermo: si sente quanti suggerimenti ci sono e quale è evidenziato", async ({ page }) => {
  await mockAddress(page, { available: true, suggestions: "ok" });
  await goToAddressStep(page);
  const address = page.getByRole("combobox", { name: /Indirizzo/ });
  await address.click();
  await address.pressSequentially("Via Rom", { delay: 40 });
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "2 suggerimenti" })).toBeAttached();

  await address.press("ArrowDown");
  const first = page.getByRole("option", { name: /Via Roma, 5/ });
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(address).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id"))!);

  const results = await new AxeBuilder({ page }).include(".address-autocomplete").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("le tessere delle categorie compaiono già in ordine, senza riordinarsi", async ({ page }) => {
  await page.route(`${API_URL}/categories/popular**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { scope: "ALL", counts: [{ slug: "pulizie", count: 50 }, { slug: "giardiniere", count: 40 }] } });
  });
  await page.goto("/preventivo");
  // Tutti gli ordini visti dall'apertura a dopo l'arrivo dei più cercati.
  const seen = new Set<string>();
  for (let i = 0; i < 15; i++) {
    const order = await page.evaluate(() =>
      [...document.querySelectorAll(".cat-tiles:not([aria-busy]) .cat-tile-label")]
        .slice(0, 3)
        .map((label) => label.textContent)
        .join(","),
    );
    if (order) seen.add(order);
    await page.waitForTimeout(100);
  }
  expect([...seen]).toEqual(["Pulizie,Giardiniere,Idraulico"]);
});
