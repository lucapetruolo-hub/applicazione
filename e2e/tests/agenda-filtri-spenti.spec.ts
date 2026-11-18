import { expect, test } from "@playwright/test";

/**
 * Voci spente di "Mostra" in vista (docs/changelog/2026-11-18-filtri-spenti-in-vista.md):
 * spegnendo una voce la casella si colora e la voce dice "Nascosti"; chiudendo la
 * colonna di sinistra il calendario dice cosa non si sta vedendo, e "Mostra tutto"
 * riaccende tutto.
 */
test("una voce spenta si vede nella casella e sopra il calendario", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "computer-tokyo", "La colonna dei filtri c'è solo da computer.");
  await page.goto("/dashboard/agenda");
  const filters = page.locator(".ag-filters");
  await expect(filters).toBeVisible();
  await expect(filters).not.toHaveClass(/has-off/);

  const finished = filters.getByRole("button", { name: /Terminati/ });
  await finished.click();
  await expect(finished).toHaveAttribute("aria-pressed", "false");
  await expect(finished).toContainText("Nascosti");
  await expect(filters).toHaveClass(/has-off/);
  await expect(filters.getByRole("status")).toHaveText(/1 voce nascosta/);
  // Con la colonna aperta l'avviso sopra il calendario non si ripete.
  const strip = page.locator(".ag-off-strip");
  await expect(strip).toBeHidden();

  await page.getByRole("button", { name: "Nascondi la colonna di sinistra" }).click();
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Non stai vedendo: Terminati");
  await strip.getByRole("button", { name: "Mostra tutto" }).click();
  await expect(strip).toHaveCount(0);

  await page.getByRole("button", { name: "Mostra la colonna di sinistra" }).click();
  await expect(page.locator(".ag-filters")).not.toHaveClass(/has-off/);
});
