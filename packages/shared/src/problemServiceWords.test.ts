import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { matchProblem, problemMatchFromDictionary } from "./problemMatch";
import { SERVICE_WORDS, serviceWordsAreSuggested } from "./problemServiceWords";

// docs/changelog/2026-11-06-dizionario-prestazioni.md
test("le parole portano solo a prestazioni suggerite del loro mestiere", () => {
  assert.equal(serviceWordsAreSuggested(), true);
  assert.ok(SERVICE_WORDS.every((entry) => entry.words.length > 0));
});

test("dal problema alla prestazione, senza intelligenza artificiale", () => {
  const cases: [string, string, string][] = [
    ["lo scarico del lavandino è intasato", "idraulico", "Sturatura scarichi"],
    ["il sifone sotto il lavello perde", "idraulico", "Sostituzione sifone"],
    ["mi salta il salvavita quando accendo il forno", "elettricista", "Ricerca guasti (salvavita che scatta)"],
    ["devo cambiare il cilindro della porta blindata", "fabbro", "Sostituzione cilindro europeo"],
    ["siepe da potare in giardino", "giardiniere", "Potatura siepi"],
    ["montare un armadio pax di ikea", "tuttofare", "Montaggio mobili IKEA"],
    ["l'idraulico deve sostituire il box doccia che perde", "idraulico", "Sostituzione box doccia"],
  ];
  for (const [text, category, service] of cases) {
    const result = problemMatchFromDictionary(matchProblem(text));
    assert.equal(result.categories[0], category, text);
    assert.equal(result.service, service, text);
  }
});

test("niente prestazione senza mestiere o per un lavoro che non copriamo", () => {
  assert.equal(matchProblem("ciao come funziona il sito").service, null);
  assert.equal(problemMatchFromDictionary(matchProblem("la lavatrice non scarica")).service, null);
});

// 100 frasi del mucchio chiuso etichettate a mano con la prestazione giusta
// (test-data/banco-prestazioni.csv, "-" se nessuna va bene, "|" tra più giuste).
// Solo per misurare: le parole non si tarano su queste frasi.
test("banco delle prestazioni: almeno 3 su 4 giuste e quasi mai sbagliate", () => {
  const read = (file: string) =>
    readFileSync(join(__dirname, "..", "test-data", file), "utf8")
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean);
  // Solo la seconda colonna (la frase): le frasi di queste righe stanno su una riga sola.
  const fraseOf = (line: string): string => {
    const rest = line.slice(line.indexOf(";") + 1);
    return rest.startsWith('"') ? rest.slice(1, rest.indexOf('";')).replace(/""/g, '"') : rest.slice(0, rest.indexOf(";"));
  };
  const frasi = new Map(read("banco-problemi.csv").map((line) => [line.slice(0, line.indexOf(";")), fraseOf(line)]));
  let labelled = 0;
  let right = 0;
  let wrong = 0;
  for (const line of read("banco-prestazioni.csv")) {
    const [id, label] = line.split(";") as [string, string];
    if (label === "-") continue;
    const frase = frasi.get(id);
    assert.ok(frase, id);
    const service = problemMatchFromDictionary(matchProblem(frase)).service;
    labelled += 1;
    if (service && label.split("|").includes(service)) right += 1;
    else if (service) wrong += 1;
  }
  assert.ok(right / labelled >= 0.72, `giuste ${right} su ${labelled}`);
  assert.ok(wrong / labelled <= 0.08, `sbagliate ${wrong} su ${labelled}`);
});
