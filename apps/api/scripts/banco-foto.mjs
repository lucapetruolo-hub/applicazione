#!/usr/bin/env node
// Banco di prova della ricerca con foto (docs/changelog/2026-11-13-ricerca-con-foto.md).
//
// Manda a POST /problem-match/photo ogni foto del banco due volte: "solo foto"
// e "testo + foto" (con la frase del cliente), rimpicciolita come fa il
// browser (lato lungo 1280 px, JPEG 0,82, orientamento dalla foto). Poi
// confronta con la chiave scritta a mano e con la soglia di accensione
// (checklist di lancio, punto 44).
//
// Le foto e la chiave non stanno nel repo (repo pubblico, foto prese da
// forum): sono nella cartella del progetto, analisi/ricerca-foto/foto-grezze/
// (note.csv, LEGGIMI.md).
//
// Uso (API con PHOTO_SEARCH_ENABLED=true e ANTHROPIC_API_KEY):
//   node apps/api/scripts/banco-foto.mjs <note.csv> <cartella foto> <uscita.csv> [indirizzo API]
// Riprende da dove si era fermato se <uscita.csv> esiste già.

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [notesPath, photoDir, outPath, api = "http://localhost:3001"] = process.argv.slice(2);
if (!notesPath || !photoDir || !outPath) {
  console.error("Uso: node banco-foto.mjs <note.csv> <cartella foto> <uscita.csv> [indirizzo API]");
  process.exit(1);
}

/** Soglia di accensione decisa con Luca il 13/11/2026. */
const THRESHOLD = { textAndPhoto: 0.91, photoOnly: 0.8, fastShare: 0.9, fastSeconds: 6 };
const HEADER = ["n", "prova", "controllo", "categorie", "descrizione", "pericolo", "secondi"];

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
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

const notes = readCsv(notesPath).filter((r) => r.usare === "si" && r.file);
if (!existsSync(outPath)) writeFileSync(outPath, HEADER.join(";") + "\n");
const done = new Set(readCsv(outPath).map((r) => `${r.n}|${r.prova}`));

const jobs = notes.flatMap((r) => [
  { note: r, test: "foto", text: "" },
  ...(r.testo_cliente ? [{ note: r, test: "testo+foto", text: r.testo_cliente }] : []),
]).filter((j) => !done.has(`${j.note.n}|${j.test}`));

// L'API accetta al massimo 6 foto al minuto da uno stesso indirizzo: una ogni 10,5 secondi.
const PAUSE_MS = 10_500;
for (let index = 0; index < jobs.length; index++) {
  const { note, test, text } = jobs[index];
  const image = await sharp(join(photoDir, note.file))
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const form = new FormData();
  form.append("image", new Blob([image], { type: "image/jpeg" }), "foto.jpg");
  if (text) form.append("description", text);
  const started = Date.now();
  try {
    const res = await fetch(`${api}/problem-match/photo`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    const seconds = ((Date.now() - started) / 1000).toFixed(2);
    let categories = "";
    let safety = "";
    if (r.photoId) {
      // Il risultato della foto lo dà la pagina dei risultati, come sul sito.
      const m = await fetch(`${api}/problem-match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: r.description, photo: r.photoId }),
        signal: AbortSignal.timeout(60_000),
      }).then((x) => x.json());
      categories = (m.categories ?? []).join("|");
      safety = m.safety ?? "";
    }
    const row = [note.n, test, r.check, categories, r.description ?? "", safety, seconds];
    appendFileSync(outPath, row.map(csvField).join(";") + "\n");
    console.log(`${index + 1}/${jobs.length} ${note.file} ${test}: ${r.check} ${categories}`);
  } catch (err) {
    console.error(`${note.file} ${test}: ${err.message}`);
    if (err.message === "HTTP 429") index--;
    await wait(err.message === "HTTP 429" ? 60_000 : 10_000);
    continue;
  }
  await wait(PAUSE_MS);
}

// Conteggio contro la chiave.
const byN = new Map(notes.map((r) => [r.n, r]));
const answers = readCsv(outPath);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "-");
const report = [];
let pass = true;
for (const test of ["testo+foto", "foto"]) {
  const rows = answers.filter((a) => a.prova === test && byN.has(a.n));
  let jobs = 0, right = 0, checks = 0, checksOk = 0, danger = 0, dangerOk = 0;
  const wrong = [];
  for (const a of rows) {
    const key = byN.get(a.n);
    if (key.controllo_atteso !== "ok") {
      checks++;
      if (a.controllo === key.controllo_atteso) checksOk++;
      else wrong.push(`${key.file}: atteso ${key.controllo_atteso}, dato ${a.controllo}`);
      continue;
    }
    const cats = a.categorie ? a.categorie.split("|") : [];
    const ok = cats.length > 0 && [key.chiave, key.alternativa].filter(Boolean).includes(cats[0]);
    jobs++;
    right += ok ? 1 : 0;
    if (!ok) wrong.push(`${key.file}: atteso ${key.chiave}, dato ${cats[0] ?? a.controllo}`);
    if (key.pericolo) {
      danger++;
      if (a.pericolo) dangerOk++;
      else wrong.push(`${key.file}: pericolo ${key.pericolo} non segnalato`);
    }
  }
  const share = jobs ? right / jobs : 0;
  const bar = test === "foto" ? THRESHOLD.photoOnly : THRESHOLD.textAndPhoto;
  if (share < bar || dangerOk < danger) pass = false;
  report.push(
    `${test}: mestiere giusto ${pct(right, jobs)} (${right}/${jobs}), soglia ${bar * 100}%`,
    `  foto che non c'entrano o con dati personali riconosciute: ${pct(checksOk, checks)} (${checksOk}/${checks})`,
    `  pericoli segnalati: ${dangerOk}/${danger}`,
    ...wrong.map((w) => `  - ${w}`),
  );
}
const seconds = answers.map((a) => Number(a.secondi)).sort((x, y) => x - y);
const fast = seconds.filter((s) => s <= THRESHOLD.fastSeconds).length;
if (seconds.length && fast / seconds.length < THRESHOLD.fastShare) pass = false;
report.push(
  `Secondi: mediana ${seconds[Math.floor(seconds.length / 2)] ?? "-"}, entro ${THRESHOLD.fastSeconds} s ${pct(fast, seconds.length)}, massimo ${seconds.at(-1) ?? "-"}`,
  pass ? "ESITO: soglia superata." : "ESITO: sotto la soglia, la ricerca con foto resta spenta.",
);
console.log(report.join("\n"));
