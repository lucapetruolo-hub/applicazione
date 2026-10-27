#!/usr/bin/env node
// Controllo della versione di Node.js (docs/CHANGELOG.md §373).
// Legge la versione esatta in .nvmrc (usata da Render e dalla CI) e la
// confronta con l'elenco ufficiale delle versioni di nodejs.org:
// - esce con errore se la versione in .nvmrc non esiste (o non è esatta);
// - stampa `aggiornare=true` se nella stessa versione principale (22.x) è
//   uscita dopo una correzione di sicurezza, con la versione più recente da
//   usare in `ultima`. Il workflow aggiunge queste righe a GITHUB_OUTPUT; i
//   messaggi per chi legge vanno sull'altra uscita (stderr).
// Uso in locale: `node scripts/controlla-node.mjs`.
import { readFileSync } from "node:fs";

const attuale = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(attuale)) {
  console.error(`.nvmrc deve contenere una versione esatta (es. 22.23.4), trovato "${attuale}".`);
  process.exit(1);
}
const principale = attuale.split(".")[0];

const risposta = await fetch("https://nodejs.org/dist/index.json", { signal: AbortSignal.timeout(30_000) });
if (!risposta.ok) {
  console.error(`nodejs.org ha risposto ${risposta.status}.`);
  process.exit(1);
}
/** @type {{ version: string; date: string; security: boolean }[]} */
const versioni = await risposta.json();

const confronta = (a, b) => {
  const [x, y] = [a, b].map((v) => v.replace(/^v/, "").split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
const stessaPrincipale = versioni
  .filter((v) => v.version.startsWith(`v${principale}.`))
  .sort((a, b) => confronta(b.version, a.version));

if (!stessaPrincipale.some((v) => v.version === `v${attuale}`)) {
  console.error(`Node ${attuale} (da .nvmrc) non esiste su nodejs.org.`);
  process.exit(1);
}

const ultima = stessaPrincipale[0];
const piuNuove = stessaPrincipale.filter((v) => confronta(v.version, attuale) > 0);
const sicurezza = piuNuove.filter((v) => v.security);

console.error(`In uso: Node ${attuale}. Ultima ${principale}.x: ${ultima.version} (${ultima.date}).`);
if (sicurezza.length > 0) {
  console.error(`Correzioni di sicurezza uscite dopo: ${sicurezza.map((v) => v.version).join(", ")}.`);
}

console.log(
  `aggiornare=${sicurezza.length > 0}\nattuale=${attuale}\nultima=${ultima.version.replace(/^v/, "")}\n` +
    `sicurezza=${sicurezza.map((v) => v.version).join(", ")}`,
);
