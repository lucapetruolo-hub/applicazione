import { expect, test, type Locator } from "@playwright/test";

/**
 * Campi ora e data con il motore di Safari (WebKit, telefono iPhone):
 * su iPhone si leggevano "08:0008:00" perché il testo del campo nativo
 * restava visibile sotto quello scritto da noi
 * (docs/changelog/2026-11-09-orari-doppi-iphone.md). Gira solo nel progetto
 * "iphone-safari".
 */
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-safari", "Riguarda il motore di Safari.");
});

/**
 * Il campo ora è un campo di testo (docs/changelog/2026-11-10-campo-orario-scrivibile.md):
 * mostra l'ora una volta sola e non esce dal suo riquadro. Il campo data
 * resta quello nativo con il testo scritto sopra.
 */
async function expectTime(field: Locator, shown: RegExp) {
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue(shown);
  const overflow = await field.evaluate((input) => input.getBoundingClientRect().width - input.parentElement!.getBoundingClientRect().width);
  expect(overflow).toBeLessThanOrEqual(0.5);
}

/** Il testo del campo data nativo non si vede e il campo non esce dal suo riquadro. */
async function expectOnlyOurText(field: Locator, shown: RegExp) {
  const look = await field.evaluate((input) => {
    const style = getComputedStyle(input);
    const own = input.getBoundingClientRect();
    const box = input.parentElement!.getBoundingClientRect();
    return {
      color: style.color,
      fill: style.getPropertyValue("-webkit-text-fill-color"),
      appearance: style.getPropertyValue("-webkit-appearance") || style.appearance,
      overflow: own.width - box.width,
      text: input.parentElement!.querySelector("[aria-hidden]")?.textContent ?? "",
    };
  });
  expect(look.color).toBe("rgba(0, 0, 0, 0)");
  expect(look.fill).toBe("rgba(0, 0, 0, 0)");
  expect(look.appearance).toBe("none");
  expect(look.overflow).toBeLessThanOrEqual(0.5);
  expect(look.text).toMatch(shown);
}

/** I due riquadri uno accanto all'altro non si sovrappongono. */
async function expectSideBySide(first: Locator, second: Locator) {
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  const sameRow = Math.abs(a.y - b.y) < a.height / 2;
  if (sameRow) expect(a.x + a.width).toBeLessThanOrEqual(b.x + 0.5);
}

test("fascia oraria: inizio e fine si leggono una volta sola", async ({ page }) => {
  await page.goto("/dashboard/agenda?tab=orari");
  await page.getByRole("button", { name: "Aggiungi fascia oraria" }).first().click();
  const modal = page.getByRole("dialog", { name: "Imposta fascia oraria" });
  await expect(modal).toBeVisible();
  const start = modal.getByLabel("Ora di inizio");
  const end = modal.getByLabel("Ora di fine");
  await expectTime(start, /^\d{2}:\d{2}$/);
  await expectTime(end, /^\d{2}:\d{2}$/);
  await expectSideBySide(start, end);
  // Sull'iPhone la rotella è la nostra e sale dal basso.
  await modal.getByRole("button", { name: "Scegli con la rotella" }).first().click();
  await expect(page.getByRole("dialog", { name: "Rotella dell'ora" })).toBeVisible();
});

test("lavoro esterno: data, inizio e fine si leggono una volta sola", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  await page.goto("/dashboard/agenda");
  const sunday = page.locator(".ag-col").nth(6);
  await expect(sunday).toBeVisible();
  await sunday.click({ position: { x: 10, y: 5 } });
  const modal = page.getByRole("dialog", { name: "Aggiungi un tuo lavoro" });
  await expect(modal).toBeVisible();
  await expectOnlyOurText(modal.getByLabel("Data"), /^\d{2}\/\d{2}\/\d{4}$/);
  const start = modal.getByLabel("Ora di inizio");
  const end = modal.getByLabel("Ora di fine");
  await expectTime(start, /^\d{2}:\d{2}$/);
  await expectTime(end, /^\d{2}:\d{2}$/);
  await expectSideBySide(start, end);
});
