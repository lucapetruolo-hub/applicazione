#!/usr/bin/env node
// Banco di prova delle prestazioni scelte dall'IA
// (docs/changelog/2026-11-13-banco-prestazioni-esperto.md).
//
// Per ogni frase chiede all'IA la prestazione 3 volte e la confronta con
// quella scritta a mano. Dà tre numeri, ciascuno con il suo margine:
//   - precisione: delle prestazioni mostrate, quante sono giuste;
//   - copertura: delle frasi che hanno una prestazione adatta, quante la trovano;
//   - data senza: delle frasi senza prestazione adatta, quante ne ricevono una lo stesso.
// Con --prima=<uscita di un giro precedente> confronta frase per frase
// (test di McNemar): dice se la differenza è vera o può essere caso.
//
// Due pile, separate dal banco stesso:
//   --pila=prova        le 100 frasi di packages/shared/test-data/banco-prestazioni.csv.
//                       Escono solo i numeri: niente testi, niente motivi, niente
//                       elenco degli errori. Servono a misurare, mai a scrivere
//                       regole o esempi.
//   --pila=allenamento  frasi della pila "lavoro" con le etichette in --etichette=<file>.
//                       Escono gli errori con frase e motivo dell'IA. Il banco si
//                       rifiuta se c'è anche una sola frase della pila di prova o
//                       del mucchio "chiuso".
//
// Due modi di chiamare l'IA:
//   (predefinito)  il sito vero (POST /problem-match). Per non prendere le risposte
//                  dalla memoria del sito, la 2a e la 3a volta la frase finisce con
//                  " ." e " ..".
//   --diretto      Anthropic direttamente, con le stesse istruzioni e lo stesso
//                  codice del sito (apps/api/dist, serve `pnpm --filter @professionisti/api build`)
//                  e il catalogo vero letto dal sito pubblico; nessuna memoria.
//                  Serve ANTHROPIC_API_KEY (o BANCO_ANTHROPIC_KEY). Non scrive
//                  nulla nel database. È il modo da usare per provare istruzioni
//                  nuove PRIMA di pubblicarle.
//
// Uso:
//   node apps/api/scripts/banco-prestazioni.mjs --pila=prova --uscita=giro.csv [--prima=giro-vecchio.csv]
//   node apps/api/scripts/banco-prestazioni.mjs --pila=allenamento --etichette=prestazioni-allenamento.csv \
//     --frasi=frasi-etichettate.csv --uscita=giro.csv [--diretto]
// Altre opzioni: --ripetizioni=3, --api=<indirizzo>, --mestiere=<codice>.
// Riprende da dove si era fermato se l'uscita esiste già.

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TEST_LABELS = resolve(ROOT, "packages/shared/test-data/banco-prestazioni.csv");
const TEST_PHRASES = resolve(ROOT, "packages/shared/test-data/banco-problemi.csv");
/** I mestieri del lancio si leggono per primi. */
const LAUNCH_TRADES = ["idraulico", "elettricista", "pulizie", "falegname"];
const HEADER = ["id", "ripetizione", "fonte", "categorie", "prestazione", "motivo", "secondi"];

const opts = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  }),
);
const pile = opts.pila;
const outPath = opts.uscita;
const repetitions = Math.max(1, Number(opts.ripetizioni ?? 3));
const api = opts.api ?? "https://professionisti-api-eu.onrender.com";
if ((pile !== "prova" && pile !== "allenamento") || !outPath) {
  console.error("Uso: banco-prestazioni.mjs --pila=prova|allenamento --uscita=<file.csv> [--etichette=<file>] [--frasi=<file>] [--prima=<file>] [--diretto]");
  process.exit(1);
}

/** CSV con il punto e virgola, campi anche tra virgolette. */
export function readCsv(path) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = readFileSync(path, "utf8");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ""));
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h, (r[j] ?? "").trim()])));
}
const csvField = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// ---- Le due pile ----
const testIds = new Set(readCsv(TEST_LABELS).map((r) => r.id));
const labelsPath = pile === "prova" ? TEST_LABELS : opts.etichette;
if (!labelsPath) {
  console.error("Con --pila=allenamento serve --etichette=<file id;prestazione>.");
  process.exit(1);
}
const phrases = new Map(readCsv(opts.frasi ?? TEST_PHRASES).map((r) => [r.id, r]));
let expected = new Map(readCsv(labelsPath).map((r) => [r.id, r.prestazione]));
if (pile === "allenamento") {
  const forbidden = [...expected.keys()].filter((id) => testIds.has(id) || phrases.get(id)?.mucchio === "chiuso");
  if (forbidden.length > 0) {
    console.error(
      `Fermo: ${forbidden.length} frasi sono della pila di prova o del mucchio "chiuso" (${forbidden.slice(0, 5).join(", ")}…). ` +
        "Le frasi di prova servono solo a misurare: non si usano per scrivere regole o esempi.",
    );
    process.exit(2);
  }
}
if (opts.mestiere) expected = new Map([...expected].filter(([id]) => phrases.get(id)?.mestiere === opts.mestiere));
const verbose = pile === "allenamento";

// ---- Chi risponde ----
async function publicCatalog() {
  const shared = await import(resolve(ROOT, "packages/shared/dist/index.js"));
  const standardRes = await fetch(`${api}/service-names/standard`);
  const standard = standardRes.ok ? await standardRes.json() : {};
  const handWritten = {};
  for (const category of shared.PROFESSIONAL_CATEGORIES) {
    const res = await fetch(`${api}/professionals/search?category=${category.slug}&limit=100`);
    if (!res.ok) continue;
    const body = await res.json();
    for (const profile of Array.isArray(body) ? body : (body.items ?? [])) {
      const slugs = (profile.categories ?? []).map((c) => c.slug).filter(shared.isProfessionalCategorySlug);
      for (const service of profile.services ?? []) {
        const slug = shared.serviceCategoryOf(service, slugs);
        if (!slug) continue;
        (handWritten[slug] ??= new Map());
        const key = shared.serviceNameKey(service.name);
        const entry = handWritten[slug].get(key) ?? { name: service.name, ids: new Set() };
        entry.ids.add(profile.id);
        handWritten[slug].set(key, entry);
      }
    }
  }
  const byCount = Object.fromEntries(
    Object.entries(handWritten).map(([slug, map]) => [slug, [...map.values()].sort((a, b) => b.ids.size - a.ids.size).map((e) => e.name)]),
  );
  return shared.buildServiceCatalog({ standard, handWritten: byCount });
}

let askDirect = null;
if (opts.diretto) {
  process.env.ANTHROPIC_API_KEY ||= process.env.BANCO_ANTHROPIC_KEY ?? "";
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("--diretto: manca ANTHROPIC_API_KEY (o BANCO_ANTHROPIC_KEY).");
    process.exit(1);
  }
  const mod = await import(resolve(ROOT, "apps/api/dist/problem-match/problem-match.service.js"));
  const catalog = await publicCatalog();
  const prismaStub = {
    problemDescription: { create: () => Promise.resolve() },
    problemWord: { findMany: () => Promise.resolve([]) },
  };
  askDirect = async (text) => {
    // Un servizio nuovo a ogni domanda: nessuna memoria delle risposte.
    const service = new mod.ProblemMatchService(prismaStub, { catalog: async () => catalog });
    let raw = null;
    const ask = service.askAi;
    service.askAi = async (t, c) => (raw = await ask(t, c));
    const result = await service.match(text);
    return { ...result, reason: raw?.reason ?? result.reason };
  };
}

async function askSite(text) {
  const res = await fetch(`${api}/problem-match`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: text }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---- Giro ----
if (!existsSync(outPath)) writeFileSync(outPath, HEADER.join(";") + "\n");
const done = new Set(readCsv(outPath).map((r) => `${r.id}#${r.ripetizione || 1}`));
const SUFFIX = ["", " .", " .."];
// Il sito accetta al massimo 20 ricerche al minuto: una ogni 3,5 secondi.
const PAUSE_MS = askDirect ? 300 : 3500;
const jobs = [];
for (let rep = 1; rep <= repetitions; rep++) for (const id of expected.keys()) if (!done.has(`${id}#${rep}`)) jobs.push({ id, rep });
for (let i = 0; i < jobs.length; i++) {
  const { id, rep } = jobs[i];
  const phrase = phrases.get(id)?.frase;
  if (!phrase) { console.error(`${id}: frase mancante`); continue; }
  const text = askDirect ? phrase : phrase + (SUFFIX[rep - 1] ?? " ".padEnd(rep, "."));
  const started = Date.now();
  try {
    const r = askDirect ? await askDirect(text) : await askSite(text);
    const seconds = ((Date.now() - started) / 1000).toFixed(2);
    const reason = verbose ? (r.reason ?? "") : "";
    appendFileSync(outPath, [id, rep, r.source ?? "", (r.categories ?? []).join("|"), r.service ?? "", reason, seconds].map(csvField).join(";") + "\n");
  } catch (err) {
    console.error(`${id}: ${err.message}`);
    if (err.message === "HTTP 429") i--;
    await new Promise((ok) => setTimeout(ok, err.message === "HTTP 429" ? 60_000 : 10_000));
    continue;
  }
  await new Promise((ok) => setTimeout(ok, PAUSE_MS));
}

// ---- Conti ----
/** Esito di una risposta: giusta, sbagliata, mancata, nessuna (giusto così) o data senza prestazione adatta. */
export function outcome(want, given) {
  if (want === "-") return given ? "data_senza" : "nessuna";
  if (!given) return "mancata";
  return want.split("|").includes(given) ? "giusta" : "sbagliata";
}
const isRight = (o) => o === "giusta" || o === "nessuna";

/** Per ogni frase la prestazione data più spesso (a parità la prima) e se è stata sempre la stessa. */
function majority(rows) {
  const byId = new Map();
  for (const r of rows) (byId.get(r.id) ?? byId.set(r.id, []).get(r.id)).push(r);
  const result = new Map();
  for (const [id, list] of byId) {
    list.sort((a, b) => Number(a.ripetizione ?? 1) - Number(b.ripetizione ?? 1));
    const counts = new Map();
    for (const r of list) counts.set(r.prestazione ?? "", (counts.get(r.prestazione ?? "") ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    result.set(id, { given: top, stable: counts.size === 1, answers: list.length, row: list.find((r) => (r.prestazione ?? "") === top) });
  }
  return result;
}

function metrics(ids, given) {
  const c = { giusta: 0, sbagliata: 0, mancata: 0, nessuna: 0, data_senza: 0 };
  for (const id of ids) c[outcome(expected.get(id), given.get(id) ?? "")]++;
  const fit = c.giusta + c.sbagliata + c.mancata;
  const none = c.nessuna + c.data_senza;
  const shown = c.giusta + c.sbagliata + c.data_senza;
  return {
    c,
    n: ids.length,
    precisione: shown ? c.giusta / shown : NaN,
    copertura: fit ? c.giusta / fit : NaN,
    dataSenza: none ? c.data_senza / none : NaN,
    sbagliatePer100: ids.length ? ((c.sbagliata + c.data_senza) / ids.length) * 100 : NaN,
  };
}

/** Generatore fisso: lo stesso giro dà sempre gli stessi margini. */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Margine al 95% col ricampionamento: si rifà il conto 2000 volte pescando a caso dalle stesse frasi. */
function bootstrap(ids, given, key) {
  const random = rng(20261113);
  const values = [];
  for (let b = 0; b < 2000; b++) {
    const sample = ids.map(() => ids[Math.floor(random() * ids.length)]);
    const v = metrics(sample, given)[key];
    if (!Number.isNaN(v)) values.push(v);
  }
  values.sort((a, b) => a - b);
  return [values[Math.floor(values.length * 0.025)], values[Math.floor(values.length * 0.975)]];
}
/** McNemar esatto: probabilità che una differenza così venga dal caso. */
function mcnemar(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let p = 0;
  let coef = 1;
  for (let i = 0; i <= k; i++) {
    if (i > 0) coef = (coef * (n - i + 1)) / i;
    p += coef;
  }
  return Math.min(1, (2 * p) / 2 ** n);
}

const pct = (v) => (Number.isNaN(v) || v === undefined ? "-" : `${Math.round(v * 100)}%`);
const range = ([lo, hi], scale = 100) => (lo === undefined ? "" : ` (tra ${Math.round(lo * scale)} e ${Math.round(hi * scale)})`);
const rows = readCsv(outPath).filter((r) => expected.has(r.id));
const votes = majority(rows);
const given = new Map([...votes].map(([id, v]) => [id, v.given]));
const ids = [...votes.keys()];

function report(label, list) {
  const m = metrics(list, given);
  const ci = (key, scale) => range(bootstrap(list, given, key), scale);
  console.log(`\n${label}: ${list.length} frasi`);
  console.log(`  Precisione (mostrate giuste): ${pct(m.precisione)}${ci("precisione")}  [${m.c.giusta} giuste, ${m.c.sbagliata} sbagliate, ${m.c.data_senza} date senza]`);
  console.log(`  Copertura (trovate): ${pct(m.copertura)}${ci("copertura")}  [${m.c.giusta} su ${m.c.giusta + m.c.sbagliata + m.c.mancata}]`);
  console.log(`  Data senza prestazione adatta: ${pct(m.dataSenza)}${ci("dataSenza")}  [${m.c.data_senza} su ${m.c.nessuna + m.c.data_senza}]`);
  console.log(`  Sbagliate su 100 frasi: ${Math.round(m.sbagliatePer100)}${range(bootstrap(list, given, "sbagliatePer100"), 1)}`);
}

console.log(`Pila ${pile}, ${opts.diretto ? "Anthropic diretto" : "sito vero"}, ${rows.length} risposte su ${expected.size * repetitions}`);
report("Tutte", ids);
const stable = [...votes.values()].filter((v) => v.answers >= 2);
if (stable.length) console.log(`  Stessa prestazione in tutte le ripetizioni: ${pct(stable.filter((v) => v.stable).length / stable.length)} delle frasi`);
for (let rep = 1; rep <= repetitions; rep++) {
  const one = new Map(rows.filter((r) => Number(r.ripetizione) === rep).map((r) => [r.id, r.prestazione ?? ""]));
  if (one.size) console.log(`  Ripetizione ${rep}: copertura ${pct(metrics([...one.keys()], one).copertura)}, sbagliate su 100 ${Math.round(metrics([...one.keys()], one).sbagliatePer100)}`);
}

// Per mestiere, prima quelli del lancio.
const trades = [...new Set(ids.map((id) => phrases.get(id)?.mestiere || "senza mestiere"))].sort(
  (a, b) => (LAUNCH_TRADES.indexOf(a) + 1 || 99) - (LAUNCH_TRADES.indexOf(b) + 1 || 99) || a.localeCompare(b),
);
console.log("\nPer mestiere (prima quelli del lancio; con poche frasi il margine è largo):");
for (const trade of trades) {
  const list = ids.filter((id) => (phrases.get(id)?.mestiere || "senza mestiere") === trade);
  const m = metrics(list, given);
  console.log(`  ${trade.padEnd(16)} ${String(list.length).padStart(3)} frasi  copertura ${pct(m.copertura).padStart(4)}  precisione ${pct(m.precisione).padStart(4)}  sbagliate ${m.c.sbagliata + m.c.data_senza}`);
}

// Prima/dopo frase per frase.
if (opts.prima) {
  const before = majority(readCsv(opts.prima).filter((r) => expected.has(r.id)));
  let better = 0, worse = 0, both = 0;
  for (const id of ids) {
    if (!before.has(id)) continue;
    both++;
    const was = isRight(outcome(expected.get(id), before.get(id).given));
    const now = isRight(outcome(expected.get(id), given.get(id)));
    if (now && !was) better++;
    if (was && !now) worse++;
  }
  const p = mcnemar(better, worse);
  console.log(`\nPrima/dopo su ${both} frasi: ${better} migliorate, ${worse} peggiorate (McNemar p = ${p.toFixed(3)}).`);
  console.log(p < 0.05 ? "  La differenza è vera (meno di 5 probabilità su 100 che sia caso)." : "  La differenza può essere caso: non basta per dire che è cambiato qualcosa.");
}

// Errori: solo per la pila di allenamento.
if (verbose) {
  console.log("\nErrori (pila di allenamento):");
  for (const id of ids) {
    const o = outcome(expected.get(id), given.get(id));
    if (isRight(o) || o === "mancata") continue;
    const v = votes.get(id);
    console.log(`  ${id} [${o}] «${phrases.get(id)?.frase}» → ${v.given} (giusta: ${expected.get(id)}) — ${v.row?.motivo ?? ""}`);
  }
} else {
  console.log("\nPila di prova: errori e testi non si mostrano (servono solo a misurare).");
}
