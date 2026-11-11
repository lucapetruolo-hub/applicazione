import { expect, test } from "@playwright/test";

/**
 * Gli esempi sotto la ricerca della home cercano subito
 * (docs/changelog/2026-11-04-esempi-cercano-subito.md): prima scrivevano solo
 * il testo nel campo e bisognava premere "Cerca".
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("un tocco su un mestiere d'esempio apre i risultati", async ({ page }) => {
  await page.goto("/");
  // L'ultima riga è "O scrivi solo chi cerchi": il primo mestiere.
  await page.locator(".hero-examples > *").last().locator(".hero-example").first().click();
  await expect(page).toHaveURL(/\/cerca/);
});

test("un tocco su una frase d'esempio cerca il problema", async ({ page }) => {
  await page.goto("/");
  // Le freccette sono solo per il mouse: i lettori di schermo sentono solo gli
  // esempi (docs/changelog/2026-11-10-prove-che-falliscono-in-locale.md).
  const examples = page.getByRole("group", { name: "Prova" });
  await expect(examples.getByRole("button").first()).toBeVisible();
  await expect(examples.getByRole("button", { name: /^(Esempi precedenti|Altri esempi)$/ })).toHaveCount(0);
  await expect(examples.locator(".hero-examples-arrow")).toHaveCount(2);
  await page.locator(".hero-examples > *").first().locator(".hero-example").first().click();
  await expect(page).toHaveURL(/\/cerca\?.*problema=/);
});
