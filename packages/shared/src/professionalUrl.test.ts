import { test } from "node:test";
import assert from "node:assert/strict";
import { professionalIdFromSlug, professionalSlug } from "./professionalUrl";

const id = "123e4567-e89b-12d3-a456-426614174000";

test("nome e città diventano un indirizzo leggibile", () => {
  assert.equal(professionalSlug({ id, businessName: "Luca Idraulica S.R.L.", city: "Latina" }), `luca-idraulica-srl-latina-${id}`);
  assert.equal(professionalSlug({ id, businessName: "--Àà  Idraulica--", city: "Latina" }), `aa-idraulica-latina-${id}`);
  assert.equal(professionalSlug({ id, businessName: "Idraulica Latina", city: "Latina" }), `idraulica-latina-${id}`);
  assert.equal(professionalSlug({ id, businessName: "!!!", city: null }), id);
});

test("un nome lungo si taglia a una parola intera", () => {
  const slug = professionalSlug({ id, businessName: "Una ditta con un nome davvero lunghissimo che supera sessanta caratteri sicuro", city: "Sezze" });
  assert.equal(slug, `una-ditta-con-un-nome-davvero-lunghissimo-che-supera-${id}`);
  assert.equal(professionalIdFromSlug(slug), id);
});

test("un testo pieno di trattini resta veloce (CodeQL js/polynomial-redos)", () => {
  const started = Date.now();
  professionalSlug({ id, businessName: `a${"-".repeat(100_000)}!`, city: "-".repeat(100_000) });
  assert.ok(Date.now() - started < 500);
});
