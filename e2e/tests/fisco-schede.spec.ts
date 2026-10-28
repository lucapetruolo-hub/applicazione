import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Area "Fisco e pagamenti" a schede (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md):
 * le stesse quattro schede in cima a ogni pagina, quella aperta segnata, si
 * raggiungono con la tastiera, i vecchi indirizzi (l'ancora dei pagamenti e il
 * ritorno da Stripe) portano alla scheda giusta, e axe non trova errori.
 */
const PAGES = [
  { path: "/dashboard/fiscale", tab: "Dati fiscali" },
  { path: "/dashboard/fiscale/pagamenti", tab: "Pagamenti online" },
  { path: "/dashboard/documenti", tab: "Fatture e documenti" },
  { path: "/dashboard/fiscale/dac7", tab: "Dati DAC7" },
];

const tabs = (page: Page) => page.getByRole("navigation", { name: "Sezioni di Fisco e pagamenti" });

for (const item of PAGES) {
  test(`${item.path}: schede in cima, "${item.tab}" aperta, axe pulito`, async ({ page }) => {
    await page.goto(item.path);
    await expect(page.getByRole("heading", { level: 1, name: "Fisco e pagamenti" })).toBeVisible();
    const nav = tabs(page);
    for (const other of PAGES) await expect(nav.getByRole("link", { name: other.tab })).toBeVisible();
    const current = nav.getByRole("link", { name: item.tab });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
    // Il contenuto della scheda ha finito di caricare prima del controllo.
    await expect(page.locator("[aria-busy]")).toHaveCount(0, { timeout: 15_000 });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("le schede si usano con la tastiera", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastiera solo da computer");
  await page.goto("/dashboard/fiscale");
  await tabs(page).getByRole("link", { name: "Dati fiscali" }).focus();
  await page.keyboard.press("Tab");
  await expect(tabs(page).getByRole("link", { name: "Pagamenti online" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/fiscale\/pagamenti$/);
  await expect(tabs(page).getByRole("link", { name: "Pagamenti online" })).toHaveAttribute("aria-current", "page");
});

test("i vecchi indirizzi portano alla scheda Pagamenti online", async ({ page }) => {
  await page.goto("/dashboard/fiscale#pagamenti-online");
  await expect(page).toHaveURL(/\/dashboard\/fiscale\/pagamenti$/);
  await page.goto("/dashboard/fiscale?stripeConnect=completato");
  await expect(page).toHaveURL(/\/dashboard\/fiscale\/pagamenti\?stripeConnect=completato$/);
});

test("il menu dell'account segna Fisco e pagamenti anche in Fatture e documenti", async ({ page, isMobile }) => {
  test.skip(isMobile, "La tendina si prova da computer");
  await page.goto("/dashboard/documenti");
  await page.getByRole("button", { name: /il mio account/i }).first().click();
  const menu = page.getByRole("menu", { name: "Il mio account" });
  await expect(menu.getByRole("menuitem", { name: /Fisco e pagamenti/ })).toHaveAttribute("aria-current", "page");
});
