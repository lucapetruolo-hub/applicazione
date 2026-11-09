// Controllo del JavaScript delle pagine pubbliche, dopo `next build`
// (docs/changelog/2026-11-09-meno-javascript-comune.md). Blocca la PR se
// home, pagine dei mestieri e delle città, profilo e altre pagine da leggere
// tornano a scaricare all'apertura:
// - zod: basta importare una costante da un file con schemi (es. una costante
//   di schemas.ts invece che di limits.ts) e arrivano circa 40 KB compressi;
// - l'elenco di tutti i comuni (circa 440 KB): va caricato a parte
//   (lib/comuniLazy.ts, docs/changelog/2026-10-30-velocita-telefono.md).
// Per ogni pagina stampa anche il peso compresso del JavaScript iniziale.
//
//   node scripts/controlla-js-pagine-pubbliche.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";

const NEXT_DIR = new URL("../.next/", import.meta.url).pathname;
const require = createRequire(import.meta.url);

/** Pagine da leggere, dove la velocità da telefono conta di più. */
const PAGES = [
  "/page",
  "/cerca/page",
  "/cerca/[categoria]/page",
  "/cerca/[categoria]/[citta]/page",
  "/cerca/[categoria]/[citta]/[servizio]/page",
  "/professionista/[id]/page",
  "/per-professionisti/page",
  "/prezzi/page",
  "/prezzi/[categoria]/page",
  "/prezzi/[categoria]/[citta]/page",
  "/faq/page",
];

/** Cosa non deve esserci, con un testo che compare solo lì anche nel codice compresso. */
const FORBIDDEN = [
  { name: "zod", marker: '"$ZodType"' },
  { name: "elenco di tutti i comuni", marker: "Abano Terme" },
];

if (!existsSync(join(NEXT_DIR, "BUILD_ID"))) {
  console.error("Manca la build del sito: esegui prima `pnpm --filter @professionisti/web build`.");
  process.exit(1);
}

/** Codice di Next.js e React, uguale per tutte le pagine (senza quello per i browser vecchi). */
const ROOT_FILES = JSON.parse(readFileSync(join(NEXT_DIR, "build-manifest.json"), "utf8")).rootMainFiles;

/** File JavaScript caricati all'apertura della pagina (layout, pagina, errori). */
function entryFiles(page) {
  const file = join(NEXT_DIR, "server/app", `${page}_client-reference-manifest.js`);
  if (!existsSync(file)) return null;
  globalThis.__RSC_MANIFEST = {};
  require(file);
  const manifest = globalThis.__RSC_MANIFEST[page];
  return [...new Set([...ROOT_FILES, ...Object.values(manifest.entryJSFiles).flat()])];
}

let failed = false;
const cache = new Map();
for (const page of PAGES) {
  const files = entryFiles(page);
  if (!files) {
    console.error(`✗ ${page}: pagina non trovata nella build (rinominata? aggiorna PAGES).`);
    failed = true;
    continue;
  }
  let gz = 0;
  const found = new Set();
  for (const name of files) {
    if (!cache.has(name)) cache.set(name, readFileSync(join(NEXT_DIR, name), "utf8"));
    const code = cache.get(name);
    gz += gzipSync(code).length;
    for (const rule of FORBIDDEN) if (code.includes(rule.marker)) found.add(rule.name);
  }
  const label = page.replace(/\/page$/, "") || "/";
  if (found.size) {
    failed = true;
    console.error(`✗ ${label}: scarica ${[...found].join(" e ")} (${Math.round(gz / 1024)} KB compressi)`);
  } else {
    console.log(`✓ ${label}: ${Math.round(gz / 1024)} KB compressi`);
  }
}

if (failed) {
  console.error(
    "\nUna pagina pubblica scarica codice che non le serve. Di solito è una costante importata da un file con schemi zod: spostala in un file senza zod (es. packages/shared/src/limits.ts).",
  );
  process.exit(1);
}
