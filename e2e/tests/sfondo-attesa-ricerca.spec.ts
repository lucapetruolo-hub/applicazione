import { expect, test } from "@playwright/test";

/**
 * Mentre la home aspetta i risultati della ricerca dal problema, le luci non
 * devono disegnare un riquadro di un altro sfondo attorno all'apertura
 * (docs/changelog/2026-11-19-sfondo-attesa-ricerca.md): prima avevano angoli
 * di 40 px, grana e bordi netti, rimasti dal vecchio hero verde.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("nell'attesa della ricerca le luci sfumano senza riquadro", async ({ page }) => {
  await page.goto("/");
  // La pagina dei risultati arriva tardi: così l'attesa resta in vista.
  await page.route(/\/cerca/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue();
  });
  await page.locator(".hero-examples > *").first().locator(".hero-example").first().click();

  const lights = page.locator(".home-hero-lights");
  await expect(lights).toBeVisible();
  const look = await lights.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      radius: style.borderTopLeftRadius,
      background: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      mask: style.maskImage || style.getPropertyValue("-webkit-mask-image"),
      grain: getComputedStyle(element, "::after").content,
    };
  });
  expect(look.radius).toBe("0px");
  expect(look.background).toBe("none");
  expect(look.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(look.mask).toContain("radial-gradient");
  expect(look.grain).toBe("none");
  await expect(page).toHaveURL(/\/cerca\?.*problema=/, { timeout: 15_000 });
});
