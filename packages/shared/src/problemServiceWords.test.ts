import assert from "node:assert/strict";
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
