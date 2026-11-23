import assert from "node:assert/strict";
import { test } from "node:test";
import { installerQualificationsFor, installerQualificationsText, validInstallerQualifications } from "./installerQualifications";
import { COMBINED_TRADES, MOVED_SUB_TAGS, categorySubTags } from "./categories";

test("il termoidraulico vede riscaldamento, acqua e gas", () => {
  assert.deepEqual(installerQualificationsFor(["idraulico", "climatizzazione"]).map((item) => item.letter), ["c", "d", "e"]);
  assert.deepEqual(installerQualificationsFor(["pulizie"]), []);
});

test("si tengono solo le lettere dei mestieri scelti, in ordine e senza doppioni", () => {
  assert.deepEqual(validInstallerQualifications(["e", "a", "d", "d", "z"], ["idraulico"]), ["d", "e"]);
  assert.deepEqual(validInstallerQualifications(["c", "d"], ["imbianchino"]), []);
});

test("testo per il profilo pubblico", () => {
  assert.equal(installerQualificationsText(["e", "c", "d"]), "riscaldamento e clima, acqua e sanitari e gas");
  assert.equal(installerQualificationsText(["e"]), "gas");
  assert.equal(installerQualificationsText([]), "");
});

test("niente più Caldaie sotto Idraulico: la vecchia pagina va a Climatizzazione", () => {
  assert.ok(!categorySubTags("idraulico").includes("caldaie"));
  assert.ok(categorySubTags("idraulico").includes("impianti-gas"));
  assert.equal(MOVED_SUB_TAGS.idraulico?.caldaie, "climatizzazione");
  assert.deepEqual(COMBINED_TRADES[0]?.categories, ["idraulico", "climatizzazione"]);
});
