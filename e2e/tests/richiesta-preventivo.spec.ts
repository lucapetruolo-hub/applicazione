import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * Richiesta di preventivo (docs/CHANGELOG.md §324): il campo indirizzo non
 * cambia il modulo mentre si scrive quando i suggerimenti di Google non
 * funzionano, si usa con un lettore di schermo, e le categorie compaiono
 * già in ordine. I servizi di Google sono simulati: la prova
 * controlla cosa vede il cliente in ogni caso. Dal 03/11/2026 la descrizione
 * viene per prima e propone la categoria
 * (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SUGGESTIONS = [
  { id: "ChIJprova000000001", main: "Via Roma, 5", secondary: "Latina LT, Italia" },
  { id: "ChIJprova000000002", main: "Via Romagnoli, 12", secondary: "Latina LT, Italia" },
];

/** Categoria scelta, mostrata nella scheda con "Cambia" (docs/changelog/2026-11-15-scelta-categoria-suggerita.md). */
function chosenCard(page: Page) {
  return page.locator(".cat-choice-card");
}

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
  await page.getByLabel("Descrivi il lavoro").fill("Il rubinetto del bagno gocciola");
  await expect(chosenCard(page).getByText("Idraulico", { exact: true })).toBeVisible();
  const home = page.getByText("A domicilio", { exact: true }).first();
  if (await home.count()) await home.click();
  await page.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name: "Con calma" }).check();
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

test("le categorie compaiono già in ordine, senza riordinarsi", async ({ page }) => {
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

test("la descrizione sceglie la categoria suggerita: scheda con Cambia e pannello con tutti i mestieri", async ({ page }) => {
  await page.goto("/preventivo");
  const description = page.getByLabel("Descrivi il lavoro");
  await expect(description).toBeVisible();
  // Primo campo del modulo, prima delle categorie.
  const first = await page.evaluate(() => document.querySelector("textarea, .cat-tile")?.tagName);
  expect(first).toBe("TEXTAREA");
  // Senza descrizione tutte le categorie a pillole.
  const pills = page.getByRole("group", { name: "Chi ti serve" });
  await expect(pills.getByRole("button", { name: "Tutto Fare" })).toBeVisible();

  await description.fill("Salta la corrente quando accendo il forno");
  const card = chosenCard(page);
  await expect(card.getByText("Elettricista", { exact: true })).toBeVisible();
  await expect(card.getByText("Suggerita dalla tua descrizione")).toBeVisible();
  await expect(page.getByText("1 di 3")).toBeVisible();
  // Le altre 14 non sono più in vista: si cambiano dal pannello.
  await expect(page.locator(".cat-tile")).toHaveCount(0);

  // Scrivendo altro la scelta segue la descrizione, finché non si sceglie a mano.
  await description.fill("Il rubinetto del bagno gocciola");
  await expect(card.getByText("Idraulico", { exact: true })).toBeVisible();
  await expect(card.getByText("Elettricista", { exact: true })).toHaveCount(0);

  const change = card.getByRole("button", { name: "Cambia" });
  await change.click();
  const panel = page.getByRole("dialog", { name: /Chi ti serve/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: /Idraulico/, pressed: true })).toBeVisible();
  await panel.getByRole("button", { name: /^Pulizie/ }).click();
  await expect(panel.getByText("2 di 3 scelte")).toBeVisible();
  await panel.getByRole("button", { name: "Fatto" }).click();
  await expect(panel).toHaveCount(0);
  await expect(change).toBeFocused();
  await expect(card.getByText("Pulizie", { exact: true })).toBeVisible();
  await expect(page.getByText("2 di 3")).toBeVisible();

  await description.fill("Salta la corrente quando accendo il forno");
  await expect(card.getByText("Idraulico", { exact: true })).toBeVisible();
  await expect(card.getByText("Pulizie", { exact: true })).toBeVisible();
});

test("pannello Cambia: la ricerca capisce le parole del problema, Esc chiude, nessun errore di accessibilità", async ({ page }) => {
  await page.goto("/preventivo");
  await page.getByLabel("Descrivi il lavoro").fill("Il rubinetto del bagno gocciola");
  const change = chosenCard(page).getByRole("button", { name: "Cambia" });
  await change.click();
  const panel = page.getByRole("dialog", { name: /Chi ti serve/ });
  const search = panel.getByRole("searchbox", { name: "Cerca un mestiere o scrivi il problema" });
  await search.fill("caldaia");
  await expect(panel.getByRole("button", { name: /Climatizzazione e caldaie/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Babysitter/ })).toHaveCount(0);
  await search.fill("serrature");
  await expect(panel.getByRole("button", { name: /Fabbro/ })).toBeVisible();
  await search.fill("zzzz");
  await expect(panel.getByText(/Nessun mestiere per/)).toBeVisible();
  await search.fill("");

  const results = await new AxeBuilder({ page }).include(".cat-sheet").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(change).toBeFocused();
});

test("scegliendo a mano dalle pillole si resta sulle pillole", async ({ page }) => {
  await page.goto("/preventivo");
  const pills = page.getByRole("group", { name: "Chi ti serve" });
  await pills.getByRole("button", { name: "Giardiniere" }).click();
  await expect(pills.getByRole("button", { name: "Giardiniere", pressed: true })).toBeVisible();
  await pills.getByRole("button", { name: "Traslochi" }).click();
  await expect(pills.getByRole("button", { name: "Traslochi", pressed: true })).toBeVisible();
  await expect(chosenCard(page)).toHaveCount(0);
});

test("suggerimento nel dubbio (l'IA non risponde): pillole con la categoria già scelta, da controllare", async ({ page }) => {
  await page.route(`${API_URL}/problem-match**`, (route) => route.fulfill({ status: 503, json: { message: "Non disponibile" } }));
  await page.goto("/preventivo");
  const description = page.getByLabel("Descrivi il lavoro");
  await description.fill("Si è staccata una piastrella");
  await description.blur();
  await expect(page.getByText("Forse ti serve Muratore e ristrutturazioni: l'abbiamo già scelta")).toBeVisible();
  await expect(page.getByRole("group", { name: "Chi ti serve" }).getByRole("button", { name: "Muratore e ristrutturazioni", pressed: true })).toBeVisible();
  await expect(chosenCard(page)).toHaveCount(0);
});

test("mentre l'IA pensa: \"Sto capendo chi ti serve…\" e poi la scheda, senza pillole in mezzo", async ({ page }) => {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route(`${API_URL}/problem-match**`, async (route) => {
    await answered;
    await route.fulfill({
      json: { categories: ["muratore"], safety: null, outOfService: null, question: null, reason: null, service: null, source: "ia", missingTrade: null, reportId: null },
    });
  });
  await page.goto("/preventivo");
  const description = page.getByLabel("Descrivi il lavoro");
  await description.fill("Si è staccata una piastrella");
  // Anche senza uscire dal campo: l'IA parte dopo una pausa di scrittura.
  const wait = page.getByRole("status").filter({ hasText: "Sto capendo chi ti serve…" });
  await expect(wait).toBeVisible();
  await expect(page.locator(".guided-chosen-hint")).toHaveText("Sto capendo chi ti serve…");
  await expect(page.locator(".cat-tile")).toHaveCount(0);
  answer();
  await expect(chosenCard(page).getByText("Muratore e ristrutturazioni", { exact: true })).toBeVisible();
  await expect(chosenCard(page).getByText(/Suggerita dall.intelligenza artificiale/)).toBeVisible();
  await expect(wait).toHaveCount(0);
});

test("\"Scegli tu\" mentre l'IA pensa mostra subito tutte le categorie", async ({ page }) => {
  await page.route(`${API_URL}/problem-match**`, () => undefined);
  await page.goto("/preventivo");
  await page.getByLabel("Descrivi il lavoro").fill("Si è staccata una piastrella");
  await page.getByRole("status").filter({ hasText: "Sto capendo chi ti serve…" }).getByRole("button", { name: "Scegli tu" }).click();
  await expect(page.getByRole("group", { name: "Chi ti serve" }).getByRole("button", { name: "Tutto Fare" })).toBeVisible();
});

test("sotto la descrizione si legge chi ti serve, e un tocco porta alla scelta", async ({ page }) => {
  await page.goto("/preventivo");
  await page.getByLabel("Descrivi il lavoro").fill("Il rubinetto del bagno gocciola");
  const hint = page.getByRole("button", { name: "Ti serve: Idraulico" });
  await expect(hint).toBeVisible();
  await hint.click();
  await expect(chosenCard(page)).toBeInViewport();
});

test("+ mestiere proposto: si dice prima che è una richiesta in più", async ({ page }) => {
  await page.goto("/preventivo?categoria=imbianchino");
  await page.getByLabel("Descrivi il lavoro").fill("Il rubinetto del bagno gocciola");
  await expect(page.getByText("Ogni mestiere aggiunto riceve una richiesta a parte.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ti serve: Imbianchino · forse anche Idraulico" })).toBeVisible();
  await page.getByRole("button", { name: "Aggiungi Idraulico" }).click();
  await expect(chosenCard(page).getByText("Idraulico", { exact: true })).toBeVisible();
  await expect(page.getByText("Riceverai una richiesta separata per ogni categoria.")).toBeVisible();
});

test("da telefono il pannello si chiude trascinandolo in giù", async ({ page, isMobile }) => {
  test.skip(!isMobile, "solo da telefono");
  await page.goto("/preventivo");
  await page.getByLabel("Descrivi il lavoro").fill("Il rubinetto del bagno gocciola");
  await chosenCard(page).getByRole("button", { name: "Cambia" }).click();
  const panel = page.getByRole("dialog", { name: /Chi ti serve/ });
  await expect(panel).toBeVisible();
  // Fine della salita del pannello, prima di misurare dove sta la maniglia.
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const grab = page.locator(".cat-sheet-grab");
  const box = (await grab.boundingBox())!;
  // Un trascinamento corto riporta il pannello al suo posto.
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 18, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(panel).toBeVisible();
  // Uno lungo lo chiude.
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 260, { steps: 12 });
  await page.mouse.up();
  await expect(panel).toHaveCount(0);
});

test("la categoria del link resta scelta qualunque cosa si scriva", async ({ page }) => {
  await page.goto("/preventivo?categoria=imbianchino");
  await page.getByLabel("Descrivi il lavoro").fill("Il rubinetto del bagno gocciola");
  const card = chosenCard(page);
  await expect(card.getByText("Imbianchino", { exact: true })).toBeVisible();
  await expect(card.getByText("Idraulico", { exact: true })).toHaveCount(0);
  // Il mestiere della descrizione resta da aggiungere con un tocco.
  await expect(page.getByRole("button", { name: "Aggiungi Idraulico" })).toBeVisible();
});

test("odore di gas: prima di tutto l'avviso di sicurezza", async ({ page }) => {
  await page.goto("/preventivo");
  await page.getByLabel("Descrivi il lavoro").fill("Sento odore di gas in cucina");
  await expect(page.getByRole("note", { name: "Prima di tutto la sicurezza" })).toBeVisible();
});

test("descrizione che non fa capire il mestiere: si sceglie dall'elenco", async ({ page }) => {
  await page.goto("/preventivo");
  await page.getByLabel("Descrivi il lavoro").fill("Mi serve una mano per una cosa");
  await expect(page.getByText("Non abbiamo capito chi ti serve: sceglilo tu, oppure aggiungi una foto qui sopra.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Chi ti serve" }).locator(".cat-tile.is-on")).toHaveCount(0);
});

test("A domicilio o Online per primo, poi gli esempi da toccare sotto la descrizione", async ({ page }) => {
  await page.goto("/preventivo");
  const description = page.getByLabel("Descrivi il lavoro");
  await expect(description).toBeVisible();
  const order = await page.evaluate(() => {
    const mode = document.querySelector('[aria-label="A domicilio"]');
    const field = document.querySelector("textarea");
    return mode && field ? Boolean(mode.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  });
  expect(order).toBe(true);

  await page.getByRole("group", { name: "Esempi" }).getByRole("button", { name: "Il rubinetto perde" }).click();
  await expect(description).toHaveValue("Il rubinetto perde ");
  await expect(description).toBeFocused();
  await expect(chosenCard(page).getByText("Idraulico", { exact: true })).toBeVisible();
  // Con il campo scritto gli esempi non servono più.
  await expect(page.getByRole("group", { name: "Esempi" })).toHaveCount(0);
});

test("con una categoria di partenza niente esempi di altri mestieri", async ({ page }) => {
  await page.goto("/preventivo?categoria=imbianchino");
  await expect(page.getByLabel("Descrivi il lavoro")).toBeVisible();
  await expect(page.getByRole("group", { name: "Esempi" })).toHaveCount(0);
});
