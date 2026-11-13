#!/usr/bin/env node
// Banco di prova della ricerca dal problema (docs/changelog/2026-11-12-attesa-ia-5-secondi.md).
//
// Manda a POST /problem-match le stesse frasi dubbie, ogni volta, e confronta il
// primo mestiere con l'etichetta scritta a mano. Si rifà prima e dopo ogni
// cambio alle istruzioni dell'IA, al modello o all'attesa: un cambio resta solo
// se il numero non scende.
//
// Le frasi etichettate non stanno nel repo (repo pubblico, frasi prese da
// forum): sono nella cartella del progetto, analisi/abbinamento-problema/
// (frasi/frasi-etichettate.csv e misura-ia/da-provare.txt).
//
// Uso:
//   node apps/api/scripts/banco-ia.mjs <frasi-etichettate.csv> <da-provare.txt> <uscita.csv> [indirizzo API] [--prestazioni=<file>]
//
// Con --prestazioni conta anche le prestazioni indicate, confrontate con quelle
// scritte a mano ("-" se nessuna va bene, "|" tra più giuste;
// docs/changelog/2026-11-13-banco-prestazioni-haiku.md). Le 100 frasi del repo:
//   node apps/api/scripts/banco-ia.mjs packages/shared/test-data/banco-problemi.csv - uscita.csv \
//     --prestazioni=packages/shared/test-data/banco-prestazioni.csv
// (con "-" al posto di <da-provare.txt> si provano le frasi del file delle prestazioni).
// Riferimento del 13/11/2026 (Claude Haiku): 56 giuste su 75 con una prestazione
// adatta, 5 sbagliate, 5 date su 25 senza prestazione adatta.
// Riprende da dove si era fermato se <uscita.csv> esiste già. Lanciarlo dopo un
// deploy nuovo: l'API tiene in memoria le ultime 500 risposte dell'IA.
//
// Riferimento del 12/11/2026 (Claude Haiku, attesa 5 s, 376 frasi, mucchio
// "chiuso"): primo mestiere giusto 86%; 94% quando risponde l'IA.

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const servicesPath = args.find((a) => a.startsWith("--prestazioni="))?.slice("--prestazioni=".length);
const [labelsPath, idsPath, outPath, api = "https://professionisti-api-eu.onrender.com"] = args.filter((a) => !a.startsWith("--"));
if (!labelsPath || !idsPath || !outPath) {
  console.error("Uso: node banco-ia.mjs <frasi-etichettate.csv> <da-provare.txt> <uscita.csv> [indirizzo API]");
  process.exit(1);
}

const REFERENCE = { top: 0.86, topAi: 0.94 };
const HEADER = ["id", "source", "categorie", "fuori_servizio", "mestiere_mancante", "secondi", "prestazione"];

/** CSV con il punto e virgola, campi anche tra virgolette. */
function readCsv(path) {
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

const labels = new Map(readCsv(labelsPath).map((r) => [r.id, r]));
const expectedServices = servicesPath ? new Map(readCsv(servicesPath).map((r) => [r.id, r.prestazione])) : null;
const ids = idsPath === "-" && expectedServices ? [...expectedServices.keys()] : readFileSync(idsPath, "utf8").split(/\s+/).filter(Boolean);
if (!existsSync(outPath)) writeFileSync(outPath, HEADER.join(";") + "\n");
const done = new Set(readCsv(outPath).map((r) => r.id));

// L'API accetta al massimo 20 ricerche al minuto da uno stesso indirizzo: una ogni 3,5 secondi.
const PAUSE_MS = 3500;
const pending = ids.filter((id) => !done.has(id));
for (let index = 0; index < pending.length; index++) {
  const id = pending[index];
  const phrase = labels.get(id)?.frase;
  if (!phrase) { console.error(`${id}: frase mancante`); continue; }
  const started = Date.now();
  try {
    const res = await fetch(`${api}/problem-match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: phrase }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    const seconds = ((Date.now() - started) / 1000).toFixed(2);
    const row = [id, r.source ?? "", (r.categories ?? []).join("|"), r.outOfService ?? "", r.missingTrade ?? "", seconds, r.service ?? ""];
    appendFileSync(outPath, row.map(csvField).join(";") + "\n");
  } catch (err) {
    console.error(`${id}: ${err.message}`);
    // Troppe richieste: si aspetta un minuto e si rifà la stessa frase.
    if (err.message === "HTTP 429") index--;
    await new Promise((ok) => setTimeout(ok, err.message === "HTTP 429" ? 60_000 : 10_000));
    continue;
  }
  await new Promise((ok) => setTimeout(ok, PAUSE_MS));
}

// Conteggio: si guarda il mucchio "chiuso" (frasi dove il mestiere giusto è uno solo o due).
const answers = readCsv(outPath);
const count = { work: 0, top: 0, workAi: 0, topAi: 0, out: 0, outOk: 0 };
const seconds = [];
for (const a of answers) {
  const label = labels.get(a.id);
  if (!label || label.mucchio !== "chiuso") continue;
  const cats = a.categorie ? a.categorie.split("|") : [];
  seconds.push(Number(a.secondi));
  if (label.fuori_servizio || label.non_e_un_lavoro) {
    count.out++;
    if (a.fuori_servizio || cats.length === 0) count.outOk++;
    continue;
  }
  const right = [label.mestiere, label.mestiere2].filter(Boolean);
  const ok = cats.length > 0 && right.includes(cats[0]);
  count.work++;
  count.top += ok ? 1 : 0;
  if (a.source === "ia") { count.workAi++; count.topAi += ok ? 1 : 0; }
}
seconds.sort((x, y) => x - y);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "-");
console.log(`Frasi con risposta: ${answers.length} su ${ids.length}`);
console.log(`Primo mestiere giusto: ${pct(count.top, count.work)} (${count.top}/${count.work}), riferimento ${REFERENCE.top * 100}%`);
console.log(`Quando risponde l'IA: ${pct(count.topAi, count.workAi)} (${count.topAi}/${count.workAi}), riferimento ${REFERENCE.topAi * 100}%`);
console.log(`Fuori servizio o non lavoro riconosciuti: ${pct(count.outOk, count.out)} (${count.outOk}/${count.out})`);
console.log(`Secondi: mediana ${seconds[Math.floor(seconds.length / 2)] ?? "-"}, massimo ${seconds.at(-1) ?? "-"}`);
if (count.work && count.top / count.work < REFERENCE.top) console.log("ATTENZIONE: sotto il riferimento, il cambio non va tenuto.");

// Prestazioni: giuste, sbagliate, mancate e date quando nessuna va bene.
if (expectedServices) {
  const s = { fit: 0, right: 0, wrong: 0, missed: 0, none: 0, givenNone: 0 };
  for (const a of answers) {
    const expected = expectedServices.get(a.id);
    if (expected === undefined) continue;
    const given = a.prestazione ?? "";
    if (expected === "-") {
      s.none++;
      if (given) { s.givenNone++; console.log(`  data senza prestazione adatta: ${a.id} → ${given}`); }
      continue;
    }
    s.fit++;
    if (!given) s.missed++;
    else if (expected.split("|").includes(given)) s.right++;
    else { s.wrong++; console.log(`  sbagliata: ${a.id} → ${given} (giusta: ${expected})`); }
  }
  console.log(`Prestazione giusta: ${pct(s.right, s.fit)} (${s.right}/${s.fit}), sbagliata ${s.wrong}, nessuna ${s.missed}`);
  console.log(`Senza prestazione adatta, data lo stesso: ${s.givenNone} su ${s.none}`);
}
