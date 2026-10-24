// Rigenera src/data/comuniCompatti.ts da comuni.json e codiciCatastali.json
// (docs/CHANGELOG.md §319): i dati restano gli stessi, ma come un'unica
// stringa per elenco invece di ~8000 oggetti, perché finiscono nel
// JavaScript di ogni pagina del sito e su un telefono lento il loro peso si
// sentiva. Uso: node packages/shared/scripts/compatta-comuni.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../src/data/", import.meta.url);
const comuni = JSON.parse(readFileSync(new URL("comuni.json", dir), "utf8"));
const codici = JSON.parse(readFileSync(new URL("codiciCatastali.json", dir), "utf8"));
const regions = {};
for (const c of comuni) {
  if (regions[c.province] && regions[c.province] !== c.region) throw new Error(`Provincia ${c.province} in due regioni`);
  regions[c.province] = c.region;
}
for (const c of comuni) for (const field of [c.name, c.province]) if (/[|\n]/.test(field)) throw new Error(`Carattere non ammesso in ${field}`);
const comuniLines = comuni.map((c) => [c.name, c.province, c.lat, c.lon, c.capoluogo ? 1 : 0].join("|")).join("\n");
const codiciLines = Object.entries(codici)
  .map(([code, value]) => `${code}|${value}`)
  .join("\n");
const out = `// Generato da scripts/compatta-comuni.mjs: non modificare a mano.
// Comuni ISTAT: nome|provincia|lat|lon|capoluogo (1/0), uno per riga.
export const COMUNI_DATA = ${JSON.stringify(comuniLines)};
export const REGION_BY_PROVINCE: Record<string, string> = ${JSON.stringify(regions)};
// Codici catastali (anche di comuni soppressi): codice|nome|provincia, uno per riga.
export const CODICI_CATASTALI_DATA = ${JSON.stringify(codiciLines)};
`;
writeFileSync(new URL("comuniCompatti.ts", dir), out);
console.log(`comuniCompatti.ts: ${(out.length / 1024).toFixed(0)} KB`);
