import assert from "node:assert/strict";
import { test } from "node:test";
import { nameSearchWords } from "./nameSearch";

function finds(query: string, name: string) {
  return nameSearchWords(query).every((word) => name.toLowerCase().includes(word));
}

test("nome dell'attività: la desinenza non conta", () => {
  assert.ok(finds("termoidraulico", "Termoidraulica Rossi"));
  assert.ok(finds("idraulici", "Idraulica Bianchi S.r.l."));
  assert.ok(finds("rossi termoidraulico", "Termoidraulica Rossi"));
  assert.ok(finds("Elettricista", "Elettricisti Associati"));
  assert.ok(finds("città", "Pulizie in città"));
});

test("nome dell'attività: parole corte intere, tutte le parole devono esserci", () => {
  assert.deepEqual(nameSearchWords("  Rossi  srl "), ["ross", "srl"]);
  assert.ok(!finds("rossi termoidraulico", "Idraulica Rossi"));
  assert.deepEqual(nameSearchWords(""), []);
});

test("barra di ricerca: i plurali dei mestieri aprono la pagina del mestiere", async () => {
  const { findCategoryByQuery } = await import("./categories");
  const cases: [string, string | undefined][] = [
    ["idraulici", "idraulico"],
    ["elettricisti", "elettricista"],
    ["imbianchini", "imbianchino"],
    ["falegnami", "falegname"],
    ["giardinieri", "giardiniere"],
    ["muratori", "muratore"],
    ["pulizia", "pulizie"],
    ["idra", "idraulico"],
    ["porta", undefined],
    ["termoidraulico", undefined],
  ];
  for (const [query, slug] of cases) assert.equal(findCategoryByQuery(query)?.slug, slug, query);
});
