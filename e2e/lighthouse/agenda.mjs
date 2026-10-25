// Lighthouse dell'agenda, di Oggi e di Richieste su un telefono lento (docs/CHANGELOG.md §309, §343):
// profilo "mobile" di Lighthouse (Moto G Power, CPU rallentata 4 volte,
// rete 4G lenta simulata). Blocca sotto i limiti "scarso" di Google
// (BUDGET) e avvisa sotto quelli "buono" (GOOD), che sono l'obiettivo.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const PORT = 9333;
/**
 * Soglie: punteggi 0-100 e tempi in millisecondi. TBT a 400 invece dei 600
 * "scarso" di Google (docs/CHANGELOG.md §343): in CI l'agenda sta intorno ai
 * 130-190 ms, quindi c'è margine contro il rumore ma un peggioramento serio
 * blocca la PR.
 */
const BUDGET = { performance: 60, accessibility: 90, "best-practices": 90, lcpMs: 4000, tbtMs: 400, cls: 0.25 };
const GOOD = { performance: 90, accessibility: 100, "best-practices": 100, lcpMs: 2500, tbtMs: 200, cls: 0.1 };

const data = JSON.parse(readFileSync(new URL("../.auth/data.json", import.meta.url), "utf8"));
// CHROMIUM_PATH: solo per provarlo in locale con un Chromium già installato.
// Contesto persistente: Lighthouse apre la sua scheda nel contesto
// predefinito del browser, quindi la sessione va scritta lì. Con
// `browser.newContext()` finiva in un contesto separato e Lighthouse
// misurava la pagina "Accedi" invece dell'agenda (docs/CHANGELOG.md §321).
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "lighthouse-")), {
  executablePath: process.env.CHROMIUM_PATH,
  args: [`--remote-debugging-port=${PORT}`],
});
const page = context.pages()[0] ?? (await context.newPage());
// Sessione già aperta: Lighthouse non deve cancellare i dati del sito (disableStorageReset).
await page.goto(WEB_URL);
await page.evaluate((token) => {
  localStorage.setItem("professionisti_token", token);
  localStorage.setItem("cookie-consent-v1", "denied");
}, data.token);
// La sessione deve funzionare davvero: altrimenti si misurerebbe la pagina "Accedi".
await page.goto(`${WEB_URL}/dashboard/agenda`);
await page.locator(".ag-strip-row, .ag-card").first().waitFor({ state: "attached", timeout: 30000 });

const pages = [
  { name: "calendario", path: "/dashboard/agenda" },
  { name: "orari", path: "/dashboard/agenda?tab=orari" },
  // Le altre due pagine aperte più spesso dal professionista (docs/CHANGELOG.md §343).
  { name: "oggi", path: "/dashboard" },
  { name: "richieste", path: "/dashboard/richieste" },
];
const rows = [];
let failed = false;
/** Tre misure per pagina e si tiene quella mediana per il punteggio, come consiglia Lighthouse CI. */
const RUNS = 3;
for (const item of pages) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const result = await lighthouse(`${WEB_URL}${item.path}`, {
      port: PORT,
      output: "json",
      logLevel: "error",
      disableStorageReset: true,
      onlyCategories: ["performance", "accessibility", "best-practices"],
    });
    runs.push(result.lhr);
  }
  runs.sort((a, b) => a.categories.performance.score - b.categories.performance.score);
  const lhr = runs[Math.floor(RUNS / 2)];
  const row = {
    pagina: item.name,
    performance: Math.round(lhr.categories.performance.score * 100),
    accessibility: Math.round(lhr.categories.accessibility.score * 100),
    "best-practices": Math.round(lhr.categories["best-practices"].score * 100),
    lcpMs: Math.round(lhr.audits["largest-contentful-paint"].numericValue),
    tbtMs: Math.round(lhr.audits["total-blocking-time"].numericValue),
    cls: Number(lhr.audits["cumulative-layout-shift"].numericValue.toFixed(3)),
    finalUrl: lhr.finalDisplayedUrl,
  };
  rows.push(row);
  const check = (limits) => {
    const out = [];
    for (const key of ["performance", "accessibility", "best-practices"]) if (row[key] < limits[key]) out.push(`${key} ${row[key]} < ${limits[key]}`);
    if (row.lcpMs > limits.lcpMs) out.push(`LCP ${row.lcpMs}ms > ${limits.lcpMs}ms`);
    if (row.tbtMs > limits.tbtMs) out.push(`TBT ${row.tbtMs}ms > ${limits.tbtMs}ms`);
    if (row.cls > limits.cls) out.push(`CLS ${row.cls} > ${limits.cls}`);
    return out;
  };
  const problems = check(BUDGET);
  if (new URL(row.finalUrl).pathname !== new URL(item.path, WEB_URL).pathname) problems.push(`pagina sbagliata: ${row.finalUrl}`);
  if (problems.length) {
    failed = true;
    console.error(`✗ ${item.name}: ${problems.join(", ")}`);
  }
  const toImprove = check(GOOD);
  if (toImprove.length) console.warn(`△ ${item.name}, da migliorare: ${toImprove.join(", ")}`);
}
await context.close();
console.table(rows);
mkdirSync(new URL("../lighthouse-results/", import.meta.url), { recursive: true });
writeFileSync(new URL("../lighthouse-results/agenda.json", import.meta.url), JSON.stringify(rows, null, 2));
process.exit(failed ? 1 : 0);
