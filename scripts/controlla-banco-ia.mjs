#!/usr/bin/env node
// Banco di prova rifatto quando cambiano le istruzioni dell'IA
// (docs/changelog/2026-11-27-il-sito-impara.md, miglioria 2 scelta da Luca:
// "prima di cambiare istruzioni all'IA si rifà il banco e si unisce solo se
// migliora").
//
// Calcola l'impronta delle istruzioni che decidono le risposte dell'IA
// (modello, istruzioni della ricerca a parole e con foto, regole e istruzioni
// delle proposte in Admin) e controlla che docs/banco-ia/esiti.md abbia una
// riga con quell'impronta: chi cambia le istruzioni rifà il banco
// (docs/banco-ia/README.md) e scrive il risultato. Senza la riga la CI è rossa.
//
// Uso: node scripts/controlla-banco-ia.mjs          controlla
//      node scripts/controlla-banco-ia.mjs --stampa  scrive solo l'impronta

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SOURCES = [
  {
    file: "apps/api/src/problem-match/problem-match.service.ts",
    blocks: [/^const MODEL = .*$/m, /^export function systemPrompt\([\s\S]*?\n\}\n/m, /^export function photoInstructions\([\s\S]*?\n\}\n/m],
  },
  {
    file: "apps/api/src/admin/case-advice.service.ts",
    blocks: [
      /^const MODEL = .*$/m,
      /^export const CASE_ADVICE_RULES = `[\s\S]*?`;$/m,
      /^export const SITE_GUIDE = `[\s\S]*?`;$/m,
      /^export const MONEY_RULES = `[\s\S]*?`;$/m,
      /^export function adviceInstructions\([\s\S]*?\n\}\n/m,
    ],
  },
];

export function fingerprint(read = (f) => readFileSync(f, "utf8")) {
  const hash = createHash("sha256");
  for (const { file, blocks } of SOURCES) {
    const text = read(file);
    for (const re of blocks) {
      const match = text.match(re);
      if (!match) throw new Error(`${file}: non trovo ${re} (spostato o rinominato? aggiorna scripts/controlla-banco-ia.mjs)`);
      hash.update(match[0]);
    }
  }
  return hash.digest("hex").slice(0, 12);
}

const print = process.argv.includes("--stampa");
const value = fingerprint();
if (print) {
  console.log(value);
} else {
  const results = readFileSync("docs/banco-ia/esiti.md", "utf8");
  if (!results.includes(`\`${value}\``)) {
    console.error(
      `::error file=docs/banco-ia/esiti.md::Le istruzioni dell'IA sono cambiate (impronta ${value}). Rifai il banco come dice docs/banco-ia/README.md e aggiungi una riga a docs/banco-ia/esiti.md con l'impronta \`${value}\` e il risultato: si unisce solo se il risultato non scende.`,
    );
    process.exit(1);
  }
  console.log(`Banco di prova in ordine (impronta ${value})`);
}
