import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { COMPUTER, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Sito usabile con la sola tastiera e senza problemi gravi per axe
 * (docs/changelog/2026-10-30-tastiera.md, collaudo gruppo 6): i difetti
 * trovati dal collaudo non devono tornare. Accettare un preventivo e
 * iscriversi come professionista si fanno solo con Tab, Invio e Spazio.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: la tastiera non dipende dal fuso.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function anonymousPage(browser: Browser, device: typeof PHONE): Promise<Page> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
    storageState: { cookies: [], origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }] }] },
  });
  return context.newPage();
}

/** Problemi gravi o critici (WCAG 2.1 A e AA) sulla pagina, uno per riga. */
async function seriousIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));
}

/** Preme Tab finché il fuoco arriva su un elemento che soddisfa `match`. */
async function tabTo(page: Page, match: (name: string, role: string | null) => boolean, max = 150): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const { name, role } = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { name: (el.getAttribute("aria-label") || el.innerText || "").trim(), role: el.getAttribute("role") };
    });
    if (match(name, role)) return;
  }
  throw new Error("Il fuoco non è mai arrivato sull'elemento cercato.");
}

const focusedRole = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("role"));

const focused = (page: Page) => page.evaluate(() => ({ name: (document.activeElement as HTMLElement).innerText?.trim(), expanded: document.activeElement?.getAttribute("aria-expanded"), checked: document.activeElement?.getAttribute("aria-checked") }));

const PUBLIC_PAGES = ["/", "/registrati", "/registrati?ruolo=PROFESSIONAL", "/preventivo?categoria=idraulico", "/urgente", "/per-professionisti", "/accedi"];

for (const [deviceName, device] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  for (const url of PUBLIC_PAGES) {
    // Niente attesa di "rete ferma": alcune pagine continuano a chiedere
    // dati (suggerimenti, contatori) e l'attesa non finirebbe mai.
    test(`${url} senza problemi gravi per axe (${deviceName})`, async ({ browser }) => {
      const page = await anonymousPage(browser, device);
      await page.goto(url);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 15_000 });
      expect(await seriousIssues(page)).toEqual([]);
    });
  }

  test(`richieste di cliente e professionista senza problemi gravi per axe (${deviceName})`, async ({ browser }) => {
    const client = await createClient(prisma);
    const pro = await createProfessional(prisma, "Marco Tastiera");
    await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(4, "10:00") });

    const clientPage = await pageAsClient(browser, client.id, device);
    await clientPage.goto("/le-mie-richieste");
    await expect(clientPage.getByText("Accetta preventivo").first()).toBeVisible();
    expect(await seriousIssues(clientPage), "/le-mie-richieste").toEqual([]);

    const proPage = await pageAsClient(browser, pro.userId, device);
    await proPage.goto("/dashboard/richieste");
    await expect(proPage.getByText("Giulia").first()).toBeVisible();
    expect(await seriousIssues(proPage), "/dashboard/richieste").toEqual([]);
  });
}

test("il cliente apre la scheda e arriva ad Accetta preventivo con la sola tastiera", async ({ browser }) => {
  const client = await createClient(prisma);
  const pros = [await createProfessional(prisma, "Paolo Tastiera"), await createProfessional(prisma, "Sara Tastiera")];
  await createRequestWithQuotes(prisma, client.id, pros.map((p) => p.id), { start: wallDay(5, "09:00") });
  await createRequestWithQuotes(prisma, client.id, [pros[0].id], { start: wallDay(6, "09:00"), description: "Seconda richiesta, per avere schede chiuse." });

  const page = await pageAsClient(browser, client.id, COMPUTER);
  await page.goto("/le-mie-richieste");
  await expect(page.getByText(/Vedi dettagli|Chiudi dettagli/).first()).toBeVisible();

  // Una scheda chiusa si apre con Invio, si richiude con Spazio.
  await tabTo(page, (name) => name === "Vedi dettagli");
  await page.keyboard.press("Enter");
  await expect.poll(() => focused(page)).toMatchObject({ name: "Chiudi dettagli", expanded: "true" });
  await page.keyboard.press(" ");
  await expect.poll(() => focused(page)).toMatchObject({ name: "Vedi dettagli", expanded: "false" });
  await page.keyboard.press("Enter");

  // Il menu delle azioni si apre, le frecce si muovono, Esc torna al pulsante.
  await page.keyboard.press("Shift+Tab");
  await tabTo(page, (name) => name === "Azioni sulla richiesta");
  await page.keyboard.press("Enter");
  await expect.poll(() => focusedRole(page)).toBe("menuitem");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Azioni sulla richiesta");

  // Dentro la scheda aperta si arriva al pulsante per accettare.
  await tabTo(page, (name) => name.startsWith("Accetta preventivo"));
});

test("menu dell'account con Esci raggiungibile dalla tastiera", async ({ browser }) => {
  const client = await createClient(prisma);
  const page = await pageAsClient(browser, client.id, COMPUTER);
  await page.goto("/le-mie-richieste");
  await tabTo(page, (name) => name.includes("il mio account"));
  await page.keyboard.press("Enter");
  await expect.poll(() => focusedRole(page)).toBe("menuitem");
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement).innerText.trim())).toBe("Esci");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-expanded"))).toBe("false");
});

test("la casella dei Termini della registrazione si spunta con Spazio", async ({ browser }) => {
  const page = await anonymousPage(browser, COMPUTER);
  await page.goto("/registrati");
  await tabTo(page, (name) => name.startsWith("Sono un professionista"));
  await page.keyboard.press("Enter");
  await tabTo(page, (name) => name.startsWith("Privato"));
  await page.keyboard.press("Enter");
  await tabTo(page, (_name, role) => role === "checkbox");
  await page.keyboard.press(" ");
  await expect.poll(async () => (await focused(page)).checked).toBe("true");
});

test("l'anello del fuoco si vede sui pulsanti verdi", async ({ browser }) => {
  const page = await anonymousPage(browser, COMPUTER);
  await page.goto("/");
  await tabTo(page, (name) => name === "Cerca");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineColor);
  expect(outline).not.toBe("rgba(0, 0, 0, 0)");
});

test("Invio in un campo dei dati fiscali non toglie il fuoco", async ({ browser }) => {
  const pro = await createProfessional(prisma, "Lara Tastiera");
  const page = await pageAsClient(browser, pro.userId, COMPUTER);
  await page.goto("/dashboard/fiscale");
  await page.getByRole("button", { name: "Privato, senza Partita IVA" }).click();
  const nome = page.getByRole("textbox", { name: "Nome", exact: true });
  await nome.fill("Lara");
  await nome.press("Enter");
  await expect(nome).toBeFocused();
});
