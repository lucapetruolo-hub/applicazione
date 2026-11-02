#!/usr/bin/env node
// Controllo mensile di quello che Dependabot non copre
// (docs/changelog/2026-10-30-admin-persone.md, richiesta di Luca del 02/11/2026).
// - React, React Native ed Expo sono esclusi da Dependabot di proposito
//   (si aggiornano a mano e insieme, CLAUDE.md §2): qui si guarda se è uscita
//   una versione principale più nuova.
// - Next.js, React, React Native e NestJS: si guarda quando smette il
//   supporto della versione che usiamo (calendario di endoflife.date) e si
//   avvisa 6 mesi prima, come per Node (scripts/controlla-node.mjs).
// Node ha il suo controllo (node.yml); PostgreSQL lo controlla l'API stessa
// ogni mese (apps/api/src/admin/database-version.service.ts), perché la
// versione del database su Render si legge solo da dentro.
// Ogni avviso diventa una segnalazione (issue) su GitHub, una sola per titolo
// (la apre il workflow aggiornamenti.yml).
// Uso in locale (solo stampa): `node scripts/controlla-aggiornamenti.mjs`.
import { readFileSync } from "node:fs";

const MESI_PREAVVISO = 6;
const leggi = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const deps = (path) => {
  const p = leggi(path);
  return { ...p.dependencies, ...p.devDependencies };
};
const web = deps("apps/web/package.json");
const mobile = deps("apps/mobile/package.json");
const api = deps("apps/api/package.json");
/** "^15.5.28" → [15, 5, 28] */
const numeri = (v) => (v ?? "").replace(/^[^\d]*/, "").split(".").map(Number);

/** "16" più nuovo di "15", "0.89" di "0.88". */
const piuNuovo = (a, b) => {
  const [x, y] = [numeri(a), numeri(b)];
  return (x[0] ?? 0) - (y[0] ?? 0) > 0 || ((x[0] ?? 0) === (y[0] ?? 0) && (x[1] ?? 0) > (y[1] ?? 0));
};

async function json(url) {
  const risposta = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!risposta.ok) throw new Error(`${url} ha risposto ${risposta.status}`);
  return risposta.json();
}

/** @type {{ titolo: string; corpo: string }[]} */
const avvisi = [];

// 1. Versioni nuove di quello che Dependabot non guarda.
const esclusi = [
  { pacchetto: "react", nome: "React", attuale: web.react, principale: (n) => `${n[0]}` },
  { pacchetto: "react-native", nome: "React Native", attuale: mobile["react-native"], principale: (n) => `${n[0]}.${n[1]}` },
  { pacchetto: "expo", nome: "Expo", attuale: mobile.expo, principale: (n) => `${n[0]}` },
];
for (const e of esclusi) {
  const ultima = (await json(`https://registry.npmjs.org/${e.pacchetto}/latest`)).version;
  const [noi, loro] = [numeri(e.attuale), numeri(ultima)];
  const piuNuova = loro[0] > noi[0] || (e.pacchetto === "react-native" && loro[0] === noi[0] && loro[1] > noi[1]);
  if (!piuNuova) continue;
  avvisi.push({
    titolo: `Nuova versione di ${e.nome}: ${e.principale(loro)}`,
    corpo: [
      `È uscita ${e.nome} ${ultima}. Oggi usiamo ${e.attuale}.`,
      "",
      "Dependabot non la propone di proposito: React, React Native ed Expo si aggiornano a mano e tutti insieme (CLAUDE.md §2, docs/CHANGELOG.md §299).",
      "",
      "Cosa fare:",
      "1. Aspettare che Expo supporti la nuova versione (React Native ed Expo escono insieme).",
      "2. Chiedere a Claude, in un thread dedicato, di aggiornare React, React Native ed Expo insieme: `overrides` in pnpm-workspace.yaml, package.json di apps/web e apps/mobile, `npx expo install --fix`, `npx expo-doctor`, e il confronto delle pagine prima e dopo.",
    ].join("\n"),
  });
}

// 2. Fine del supporto delle versioni che usiamo.
const calendari = [
  { slug: "nextjs", nome: "Next.js", ciclo: `${numeri(web.next)[0]}` },
  { slug: "react", nome: "React", ciclo: `${numeri(web.react)[0]}` },
  { slug: "react-native", nome: "React Native", ciclo: `${numeri(mobile["react-native"])[0]}.${numeri(mobile["react-native"])[1]}` },
  { slug: "nestjs", nome: "NestJS", ciclo: `${numeri(api["@nestjs/core"])[0]}` },
];
const limite = new Date();
limite.setMonth(limite.getMonth() + MESI_PREAVVISO);
for (const c of calendari) {
  /** @type {{ cycle: string; eol: string | boolean; latest?: string }[]} */
  const cicli = await json(`https://endoflife.date/api/${c.slug}.json`);
  const nostro = cicli.find((x) => x.cycle === c.ciclo);
  if (!nostro || typeof nostro.eol !== "string" || new Date(nostro.eol) > limite) continue;
  const fine = new Date(nostro.eol).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const passata = new Date(nostro.eol) < new Date();
  avvisi.push({
    titolo: `${c.nome} ${c.ciclo}: ${passata ? "supporto finito il" : "supporto fino al"} ${fine}`,
    corpo: [
      `${c.nome} ${c.ciclo}, la versione che usiamo, ${passata ? "non riceve più correzioni di sicurezza dal" : "riceve correzioni di sicurezza solo fino al"} ${fine}.`,
      `Versioni più nuove: ${cicli.filter((x) => piuNuovo(x.cycle, c.ciclo)).map((x) => x.cycle).slice(0, 3).join(", ") || "nessuna"}.`,
      "",
      "Cosa fare:",
      `1. Chiedere a Claude, in un thread dedicato, di passare a una versione di ${c.nome} ancora supportata, con le prove e il confronto delle pagine prima e dopo (\`pnpm --filter @professionisti/web confronto-pagine\`).`,
      "2. Aggiornare CLAUDE.md §2 se cambia la versione scritta nella tabella.",
      "",
      `Calendario: https://endoflife.date/${c.slug}`,
    ].join("\n"),
  });
}

for (const a of avvisi) console.error(`- ${a.titolo}`);
if (avvisi.length === 0) console.error("Niente da aggiornare.");

// 3. Gli avvisi in JSON sull'uscita standard (i messaggi per chi legge vanno su
// stderr): le segnalazioni le apre il workflow con `gh`, una per titolo, come in node.yml.
console.log(JSON.stringify(avvisi));
