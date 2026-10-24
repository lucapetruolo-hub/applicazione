import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eData } from "../fixtures/data";

/**
 * Accessibilità dell'agenda con axe-core (docs/CHANGELOG.md §292): nessun
 * problema grave o critico (WCAG 2.1 A e AA) nelle tre schede e nel riquadro
 * dell'appuntamento.
 *
 * KNOWN elenca i problemi già trovati e in attesa della decisione
 * dell'utente (tabella della verifica, §292): la prova li lascia passare ma
 * fallisce su qualunque problema nuovo. Quando uno viene corretto, la sua
 * riga va tolta.
 */
type Violation = { id: string; html: string };

const KNOWN: { finding: string; id: string; html: RegExp }[] = [
  // A3: il nome letto dal lettore di schermo non contiene il testo visibile (WCAG 2.5.3).
  { finding: "A3", id: "label-content-name-mismatch", html: /aria-label="Il mio account/ },
  { finding: "A3", id: "label-content-name-mismatch", html: /aria-label="(Lun|Mar|Mer|Gio|Ven|Sab|Dom) \d+"/ },
  { finding: "A3", id: "label-content-name-mismatch", html: /class="ag-ev / },
  { finding: "A3", id: "label-content-name-mismatch", html: /aria-label="Apri il giorno \d+"/ },
  // A4: testo "gg/mm/aaaa" vuoto e giorni fuori mese troppo chiari (WCAG 1.4.3).
  { finding: "A4", id: "color-contrast", html: /it-date-text empty/ },
  { finding: "A4", id: "color-contrast", html: /aria-label="\d+ [A-Z][a-z]+"/ },
];

async function seriousViolations(page: Page): Promise<{ unknown: string[]; known: Set<string> }> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const unknown: string[] = [];
  const known = new Set<string>();
  for (const violation of results.violations) {
    if (violation.impact !== "serious" && violation.impact !== "critical") continue;
    for (const node of violation.nodes) {
      const found: Violation = { id: violation.id, html: node.html };
      const match = KNOWN.find((k) => k.id === found.id && k.html.test(found.html));
      if (match) known.add(`${match.finding} ${match.id}`);
      else unknown.push(`${violation.id} (${violation.impact}): ${violation.help} → ${node.html.slice(0, 160)}`);
    }
  }
  return { unknown, known };
}

const views = [
  { name: "Calendario", path: "/dashboard/agenda" },
  { name: "Orari di lavoro", path: "/dashboard/agenda?tab=orari" },
  { name: "Giro intelligente", path: "/dashboard/agenda?tab=giro" },
];

for (const view of views) {
  test(`${view.name}: nessun problema grave di accessibilità`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
    await page.goto(view.path);
    await expect(page.getByRole("group", { name: "Sezioni dell'agenda" })).toBeVisible();
    // L'agenda resta collegata al server per gli avvisi in tempo reale: si aspetta il contenuto, non la rete ferma.
    await expect(page.getByText(/Condominio Aurora|Settimana tipo|Giro/).first()).toBeVisible();
    const { unknown, known } = await seriousViolations(page);
    testInfo.annotations.push({ type: "problemi noti", description: [...known].join(", ") || "nessuno" });
    expect(unknown).toEqual([]);
  });
}

test("riquadro dell'appuntamento: nessun problema grave di accessibilità", async ({ page }, testInfo) => {
  const booking = e2eData().bookings[1]!;
  await page.goto(`/dashboard/agenda?booking=${booking.id}`);
  await expect(page.getByRole("dialog", { name: /Appuntamento con/ })).toBeVisible();
  const { unknown, known } = await seriousViolations(page);
  testInfo.annotations.push({ type: "problemi noti", description: [...known].join(", ") || "nessuno" });
  expect(unknown).toEqual([]);
});
