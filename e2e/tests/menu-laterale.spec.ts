import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eData } from "../fixtures/data";
import { API_URL } from "../fixtures/env";

/**
 * Menu laterale del professionista ridotto a icone (docs/CHANGELOG.md §334):
 * parte ridotto fino a 1366px, la scelta della persona vince, resta anche
 * ricaricando (senza aprirsi e richiudersi) e sull'account; fumetto col nome
 * che si chiude con Esc (WCAG 1.4.13), tasto [, colonna con i nomi sul tablet
 * in verticale, anche per il cliente. Solo da computer: sul telefono c'è la barra di sempre.
 */
test.skip(({ isMobile }) => isMobile, "Il menu a colonna c'è solo da tablet e computer");

const nav = (page: Page) => page.getByRole("navigation", { name: "Sezioni del tuo account" });
const navState = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-acct-nav"));

/** Il tondo "Riduci il menu" non copre né le voci né il testo dei titoli (docs/CHANGELOG.md §337). */
async function expectToggleFree(page: Page) {
  const covered = await page.evaluate(() => {
    const t = document.querySelector(".acct-nav-toggle")!.getBoundingClientRect();
    const hits = (r: DOMRect) => r.width > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
    const links = [...document.querySelectorAll(".acct-nav-link")].filter((el) => hits(el.getBoundingClientRect()));
    const titles = [...document.querySelectorAll(".acct-nav-title")].filter((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return hits(range.getBoundingClientRect());
    });
    return [...links, ...titles].map((el) => el.textContent);
  });
  expect(covered).toEqual([]);
}

async function savePreference(page: Page, sidebarCollapsed: boolean | null) {
  const response = await page.request.patch(`${API_URL}/auth/me/preferences`, {
    headers: { Authorization: `Bearer ${e2eData().token}` },
    data: { sidebarCollapsed },
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await savePreference(page, null);
  await page.addInitScript(() => {
    // Ogni prova parte senza una scelta salvata nel browser.
    if (!sessionStorage.getItem("menu-e2e")) {
      sessionStorage.setItem("menu-e2e", "1");
      localStorage.removeItem("professionisti_menu_ridotto");
    }
  });
});

test("parte ridotto fino a 1366px e aperto sopra", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dashboard");
  await expect(nav(page).getByRole("button", { name: "Espandi il menu" })).toBeVisible();
  expect(await navState(page)).toBe("collapsed");
  // Ridotto, nessun titolo di gruppo: "Lavoro" usciva dalla colonna (§351).
  await expect(nav(page).locator(".acct-nav-title").first()).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(nav(page).getByRole("button", { name: "Riduci il menu a icone" })).toBeVisible();
  expect(await navState(page)).toBeNull();
  await expect(nav(page).locator(".acct-nav-title").first()).toBeVisible();
});

test("la scelta resta ricaricando, già prima che la pagina sia pronta, e sull'account", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dashboard");
  await nav(page).getByRole("button", { name: "Espandi il menu" }).click();
  await expect(nav(page).getByRole("button", { name: "Riduci il menu a icone" })).toBeVisible();

  // Lo script nel <head> mette lo stato prima del primo disegno: niente menu che si apre e si richiude.
  await page.reload({ waitUntil: "commit" });
  await page.waitForLoadState("domcontentloaded");
  expect(await navState(page)).toBeNull();

  // Su un altro dispositivo (nessuna scelta nel browser) la scelta arriva dall'account.
  await expect.poll(async () => (await page.request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${e2eData().token}` } }).then((r) => r.json())).sidebarCollapsed).toBe(false);
  await page.evaluate(() => localStorage.removeItem("professionisti_menu_ridotto"));
  await page.reload();
  await expect(nav(page).getByRole("button", { name: "Riduci il menu a icone" })).toBeVisible();
});

test("tasto [ e fumetto col nome che si chiude con Esc", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(nav(page).getByRole("button", { name: "Riduci il menu a icone" })).toBeVisible();
  await page.locator("body").press("[");
  await expect(nav(page).getByRole("button", { name: "Espandi il menu" })).toBeVisible();

  const agenda = nav(page).getByRole("link", { name: /Agenda/ });
  const tip = agenda.locator(".acct-nav-label");
  await agenda.hover();
  await expect(tip).toHaveCSS("opacity", "1");
  // Si può portare il puntatore sopra il fumetto senza che sparisca.
  await tip.hover();
  await expect(tip).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCSS("opacity", "0");

  // Il tasto non scatta mentre si scrive.
  await page.goto("/dashboard/richieste");
  await page.getByPlaceholder("Cerca in ogni campo della richiesta...").fill("[");
  await expect(nav(page).getByRole("button", { name: "Espandi il menu" })).toBeVisible();
});

test("tablet in verticale: colonna con icona e nome breve", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/dashboard");
  await expect(nav(page).getByText("Richieste", { exact: true })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Richieste e lavori" })).toBeVisible();
  await expect(nav(page).getByRole("button", { name: /menu/ })).toBeHidden();
});

for (const [name, width, height, collapsed] of [
  ["computer, menu aperto", 1440, 900, false],
  ["computer, menu ridotto", 1440, 900, true],
  ["tablet in verticale", 820, 1180, null],
] as const) {
  test(`${name}: nessun problema di accessibilità nel menu`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/dashboard");
    if (collapsed !== null) {
      await page.evaluate((value) => localStorage.setItem("professionisti_menu_ridotto", value ? "1" : "0"), collapsed);
      await page.reload();
    }
    await expect(nav(page)).toBeVisible();
    if (collapsed !== null) await expectToggleFree(page);
    const results = await new AxeBuilder({ page }).include(".acct-nav").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`)).toEqual([]);
  });
}

test("anche il cliente ha il menu laterale, riducibile e senza problemi di accessibilità", async ({ page }) => {
  const response = await page.request.post(`${API_URL}/auth/register`, {
    data: { email: `cliente-menu-${Date.now()}@test.it`, password: "Prova12345", name: "Cliente Prova", role: "CLIENT", acceptedLegalTerms: true, declaredAdult: true },
  });
  expect(response.ok()).toBe(true);
  const { token } = (await response.json()) as { token: string };
  await page.goto("/");
  await page.evaluate((t) => localStorage.setItem("professionisti_token", t), token);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/le-mie-richieste");
  await expect(nav(page).getByRole("link", { name: "Le mie richieste" })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByRole("link", { name: "Professionisti salvati" })).toBeVisible();
  await expectToggleFree(page);
  await nav(page).getByRole("button", { name: "Riduci il menu a icone" }).click();
  expect(await navState(page)).toBe("collapsed");
  await expectToggleFree(page);
  const results = await new AxeBuilder({ page }).include(".acct-nav").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
