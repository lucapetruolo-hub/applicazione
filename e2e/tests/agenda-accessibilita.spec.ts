import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eData } from "../fixtures/data";

/**
 * Accessibilità dell'agenda con axe-core (docs/CHANGELOG.md §304): nessun
 * problema grave o critico (WCAG 2.1 A e AA) nelle tre schede e nel riquadro
 * dell'appuntamento.
 *
 * KNOWN elenca i problemi noti che la prova lascia passare: vuoto dal
 * §305, quando A3 e A4 della verifica (§304) sono stati corretti. Ogni
 * problema grave fa fallire la prova.
 */
type Violation = { id: string; html: string };

const KNOWN: { finding: string; id: string; html: RegExp }[] = [];

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
