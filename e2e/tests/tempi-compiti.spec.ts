import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Tempi dei 5 compiti principali dell'agenda (docs/CHANGELOG.md §309), fatti
 * sul sito vero da un telefono. Il tempo è una stima con il modello KLM
 * (Keystroke-Level Model): non sostituisce la prova con persone vere, ma
 * dice se una modifica allunga un compito. Gira per ultima (progetto
 * "misure") perché completa un lavoro e chiude un giorno.
 */
// Stima KLM per telefono (Card, Moran, Newell; valori per touch di Holleis et al. 2007):
// T tocco su un bersaglio 0,40 s (puntare + toccare con il pollice), K carattere 0,35 s,
// M pensare/cercare 1,35 s (uno per schermata o scelta), S scorrere 1,00 s, R attesa misurata.
const OP = { T: 0.4, K: 0.35, M: 1.35, S: 1.0 };
type Log = { ops: string[]; waitMs: number };
const results: Record<string, { steps: string; taps: number; chars: number; klmSeconds: number; waitSeconds: number }> = {};

async function timed(log: Log, fn: () => Promise<unknown>) {
  const t = Date.now();
  await fn();
  log.waitMs += Date.now() - t;
}
function done(name: string, log: Log) {
  const count = (c: string) => log.ops.filter((o) => o === c).length;
  const klm = log.ops.reduce((s, o) => s + (o.startsWith("K") ? OP.K * Number(o.slice(1)) : OP[o as "T" | "M" | "S"]), 0);
  const chars = log.ops.filter((o) => o.startsWith("K")).reduce((s, o) => s + Number(o.slice(1)), 0);
  results[name] = { steps: log.ops.join(" "), taps: count("T"), chars, klmSeconds: Math.round((klm + log.waitMs / 1000) * 10) / 10, waitSeconds: Math.round(log.waitMs / 100) / 10 };
}

test.afterAll(() => {
  mkdirSync(new URL("../misure-results/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../misure-results/tempi-compiti.json", import.meta.url), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});

async function openAgenda(page: Page, log: Log, path = "/dashboard/agenda") {
  // Si parte dalla home dell'area professionista, come chi apre l'app.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading").first()).toBeVisible();
  log.ops.push("M", "T");
  await timed(log, async () => {
    await page.goto(path);
    await expect(page.getByRole("group", { name: "Sezioni dell'agenda" })).toBeVisible();
  });
}

test("C1 stasera so dove devo andare domani", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T18:00:00Z"));
  const log: Log = { ops: [], waitMs: 0 };
  await openAgenda(page, log);
  // Domenica senza lavori l'agenda si apre già sulla settimana di domani (docs/changelog/2026-10-28-agenda-orari-in-vista.md): niente freccia.
  log.ops.push("M", "T"); // primo appuntamento
  await timed(log, async () => {
    await page.getByRole("button", { name: /09:00–10:30/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Via Emanuele Filiberto");
  });
  log.ops.push("M"); // leggere l'indirizzo
  done("C1 Stasera so dove devo andare domani", log);
});

test("C2 chiudo un giorno (venerdì) per un impegno", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  const log: Log = { ops: [], waitMs: 0 };
  await openAgenda(page, log);
  log.ops.push("M", "T");
  await page.getByRole("button", { name: "Orari di lavoro" }).click();
  // "Giorno per giorno" è in fondo alla scheda; sul telefono la striscia della settimana porta a venerdì con un tocco (U1, §310).
  log.ops.push("S", "S", "M");
  const section = page.getByRole("heading", { name: "Giorno per giorno" }).locator("xpath=ancestor::div[2]");
  await section.scrollIntoViewIfNeeded();
  log.ops.push("T"); // venerdì 30 nella striscia
  await section.getByRole("group", { name: "Giorni della settimana" }).getByRole("button", { name: /30/ }).click();
  await expect(section.getByRole("button", { name: /30/, pressed: true })).toBeVisible();
  log.ops.push("M", "T");
  await timed(log, async () => {
    await section.getByRole("button", { name: "Chiudi venerdì 30", exact: true }).click();
    await expect(section.getByRole("button", { name: "Riapri venerdì 30", exact: true })).toBeVisible();
  });
  done("C2 Chiudo venerdì", log);
});

test("C3 arrivo dal cliente: navigo e lo avviso", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T07:30:00Z"));
  const log: Log = { ops: [], waitMs: 0 };
  await openAgenda(page, log);
  log.ops.push("M", "T");
  await page.getByRole("button", { name: /09:00–10:30/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  log.ops.push("M", "T"); // Sto arrivando
  await timed(log, async () => {
    await page.getByRole("dialog").getByRole("button", { name: /Sto arrivando/ }).click();
    await page.waitForTimeout(300);
  });
  log.ops.push("M", "T"); // Naviga (apre Google Maps)
  await expect(page.getByRole("link", { name: /Naviga/ }).or(page.getByRole("button", { name: /Naviga/ })).first()).toBeVisible();
  done("C3 Avviso il cliente e navigo", log);
});

test("C4 segno il lavoro completato", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T10:45:00Z"));
  const log: Log = { ops: [], waitMs: 0 };
  await openAgenda(page, log);
  log.ops.push("M", "T");
  await page.getByRole("button", { name: /09:00–10:30/ }).first().click();
  log.ops.push("M", "T");
  await page.getByRole("button", { name: "Lavoro completato" }).click();
  const modal = page.getByRole("dialog", { name: "Segnala lavoro terminato" });
  await expect(modal).toBeVisible();
  const amount = modal.getByRole("textbox", { name: /Importo/ }).first();
  const description = modal.getByRole("textbox", { name: "Descrizione della voce" });
  if (await description.count()) {
    // Preventivo senza voci: la voce ha già il nome del lavoro, non si scrive nulla (U2, §310).
    await expect(description).not.toHaveValue("");
  }
  log.ops.push("M", "T", "K3"); // importo finale, es. 120
  await amount.fill("120");
  const checkboxes = modal.getByRole("checkbox");
  for (let i = 0; i < (await checkboxes.count()); i++) {
    log.ops.push("M", "T");
    await checkboxes.nth(i).check();
  }
  const submit = modal.getByRole("button", { name: /Conferma|Segnala|Invia/ }).last();
  log.ops.push("M", "T");
  await timed(log, async () => {
    await submit.click();
    await expect(modal).toBeHidden({ timeout: 15000 });
  });
  done("C4 Lavoro completato", log);
});

test("C5 aggiungo un lavoro preso fuori dalla piattaforma", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  const log: Log = { ops: [], waitMs: 0 };
  await openAgenda(page, log);
  log.ops.push("M", "T");
  await page.getByRole("button", { name: "Aggiungi lavoro" }).click();
  const modal = page.getByRole("dialog", { name: "Aggiungi un tuo lavoro" });
  await expect(modal).toBeVisible();
  log.ops.push("M", "T", "K11"); // "Mario Rossi"
  await modal.getByRole("textbox", { name: "Nome cliente" }).fill("Mario Rossi");
  log.ops.push("T", "K14"); // "Via Roma 1, Latina" (senza suggerimenti)
  await modal.getByRole("textbox", { name: "Indirizzo" }).fill("Via Roma 1 Latina");
  log.ops.push("M", "T", "T", "T", "T"); // ora di inizio e di fine (selettore orario)
  await modal.getByLabel("Ora di inizio").fill("15:00");
  await modal.getByLabel("Ora di fine").fill("16:00");
  log.ops.push("M", "T");
  await timed(log, async () => {
    await modal.getByRole("button", { name: "Salva" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });
  });
  done("C5 Lavoro esterno", log);
});
