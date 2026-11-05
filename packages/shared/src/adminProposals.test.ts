import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFESSIONAL_CATEGORIES } from "./categories";
import { describeProblemExample, SUGGESTED_PROBLEM_EXAMPLES } from "./problemExamples";
import { nearlySameServiceName } from "./serviceNames";
import { ADMIN_PROPOSAL_KINDS, ADMIN_PROPOSAL_KINDS_INFO } from "./adminProposals";

test("ogni frase pronta è riconosciuta con sicurezza dal suo mestiere", () => {
  for (const category of PROFESSIONAL_CATEGORIES) {
    const list = SUGGESTED_PROBLEM_EXAMPLES[category.slug];
    assert.ok(list.length > 0, `${category.slug} senza frasi pronte`);
    for (const text of list) assert.equal(describeProblemExample(text).categorySlug, category.slug, text);
  }
});

test("nomi quasi uguali: altro ordine o un errore di battitura, mai nomi diversi", () => {
  assert.equal(nearlySameServiceName("Caldaia pulizia", "Pulizia caldaia"), true);
  assert.equal(nearlySameServiceName("Pulzia caldaia", "Pulizia caldaia"), true);
  assert.equal(nearlySameServiceName("Montaggio zanzarire", "Montaggio zanzariere"), true);
  // Già uguali per serviceNameKey: non serve unirli.
  assert.equal(nearlySameServiceName("Pulizia della caldaia", "Pulizia caldaia"), false);
  assert.equal(nearlySameServiceName("Posa", "Pose"), false);
  assert.equal(nearlySameServiceName("Trasloco 2 locali", "Trasloco 3 locali"), false);
  assert.equal(nearlySameServiceName("Taglio erba", "Taglio legna"), false);
  assert.equal(nearlySameServiceName("Pulizia vetri", "Pulizia vetrine"), false);
});

test("ogni tipo di proposta ha permesso e pulsante", () => {
  for (const kind of ADMIN_PROPOSAL_KINDS) {
    assert.ok(ADMIN_PROPOSAL_KINDS_INFO[kind].approveLabel.length > 0);
    assert.notEqual(ADMIN_PROPOSAL_KINDS_INFO[kind].scope, "ANY");
  }
});
