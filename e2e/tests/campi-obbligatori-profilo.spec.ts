import { expect, test, type Locator } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Campi obbligatori del profilo (docs/changelog/2026-11-19-campi-obbligatori-profilo.md,
 * segnalazione di Luca da iPhone): "Città in cui operi" era grigia e sembrava
 * già scelta; ora è bianca come gli altri campi. Premendo "Salva profilo" con
 * un campo mancante l'errore sta sopra il pulsante e, toccato, porta al campo
 * con il cursore dentro, anche se è in un'altra parte del modulo; il campo ha
 * il bordo rosso finché resta sbagliato e, corretto, l'errore sparisce.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Basta un telefono e un computer.");
});

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

/** Cursore nel campo e campo davvero visibile: né fuori schermo né sotto le barre in alto. */
async function expectFocusedInView(field: Locator) {
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
  await expect
    .poll(() =>
      field.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + 8, rect.top + rect.height / 2);
        return !!top && (el === top || el.contains(top));
      }),
    )
    .toBe(true);
}

test("l'errore del salvataggio porta al campo che manca", async ({ page }) => {
  const stamp = `${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      role: "PROFESSIONAL",
      email: `pro-campi-${stamp}@test.it`,
      name: "Sara",
      surname: "Prova",
      phone: `+3934${stamp.slice(-8)}`,
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
      signupCategorySlugs: ["idraulico"],
    },
  });
  const token = testToken(user.id);
  await page.addInitScript(
    ([origin, value]) => {
      if (window.location.origin !== origin) return;
      localStorage.setItem("cookie-consent-v1", "denied");
      localStorage.setItem("professionisti_token", value);
    },
    [new URL(WEB_URL).origin, token] as const,
  );

  await page.goto("/dashboard/profilo");
  await expect(page.getByRole("heading", { name: "Ora il tuo profilo pubblico" })).toBeVisible();

  // La città vuota ha lo stesso fondo bianco dell'indirizzo, non grigio.
  const city = page.locator("#profilo-campo-citta");
  const address = page.getByLabel("Indirizzo preciso (opzionale)");
  const background = (field: Locator) => field.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background(city)).toBe(await background(address));
  expect(await background(city)).toBe("rgb(255, 255, 255)");

  // Manca più di un campo (nome e città): l'errore porta al primo, il nome.
  const name = page.getByLabel("Nome attività");
  await name.fill("x");
  await name.fill("");
  await page.getByRole("button", { name: "Salva profilo" }).last().click();
  const error = page.getByRole("button", { name: /Inserisci il nome della tua attività\. Vai al campo/ });
  await expect(error).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  await error.click();
  await expectFocusedInView(name);

  // Poi la città: l'errore resta sopra "Salva profilo", in fondo allo schermo.
  await name.fill(`Idraulica Campi ${stamp.slice(-4)}`);
  await page.getByRole("button", { name: "Salva profilo" }).last().click();
  const cityError = page.getByRole("button", { name: /Indica la città in cui operi\. Vai al campo/ });
  await expect(cityError).toBeInViewport();
  await cityError.click();
  await expectFocusedInView(city);
  // Bordo rosso finché la città manca; scritta la città, bordo ed errore spariscono da soli.
  const cityBox = page.locator(".guided-city").filter({ has: city });
  const borderColor = () => cityBox.evaluate((el) => getComputedStyle(el).borderTopColor);
  await expect.poll(borderColor).toBe("rgb(180, 35, 24)");
  await city.fill("Latina");
  await city.press("Escape");
  await expect(cityError).toHaveCount(0);
  await expect.poll(borderColor).not.toBe("rgb(180, 35, 24)");

  // Un campo in un'altra parte del modulo: gli anni di esperienza.
  const years = page.getByLabel("Anni di esperienza");
  await years.fill("200");
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.getByRole("button", { name: "Salva profilo" }).last().click();
  const yearsError = page.getByRole("button", { name: /Gli anni di esperienza devono essere un numero tra 0 e 80\. Vai al campo/ });
  await yearsError.click();
  await expectFocusedInView(years);
  await expect(years).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("navigation", { name: "Parti del profilo" }).getByRole("link", { name: "Esperienza" })).toHaveAttribute(
    "aria-current",
    "location",
  );
});
