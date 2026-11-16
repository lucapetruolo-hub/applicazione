import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTACT_FAQ_COUNT, CONTACT_FAQ_DEFAULT, FAQ, FAQ_TOPICS, contactFaqEligible, contactFaqOrDefault, faqByIds, faqForAudience, faqWithMonths, normalizeFaqText } from "./faq";

describe("domande frequenti", () => {
  it("ogni id è unico e fatto di lettere, numeri e trattini (serve come ancora #id)", () => {
    const ids = FAQ.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
  });

  it("ogni domanda ha un argomento del suo pubblico", () => {
    for (const item of FAQ) assert.ok(FAQ_TOPICS[item.audience].includes(item.topic), item.id);
  });

  it("{mesi} solo nelle domande dei mesi gratis", () => {
    for (const item of FAQ) {
      const uses = `${item.question} ${item.answer}`.includes("{mesi}");
      assert.equal(uses, Boolean(item.founderOffer), item.id);
    }
  });

  it("i link portano a pagine del sito", () => {
    for (const item of FAQ) if (item.more) assert.ok(item.more.startsWith("/"), item.id);
  });

  it("le risposte restano brevi", () => {
    for (const item of FAQ) assert.ok(item.answer.length <= 420, item.id);
  });

  it("almeno 40 domande, divise tra i due pubblici in ordine di argomento", () => {
    assert.ok(FAQ.length >= 40);
    const pro = faqForAudience("professionista");
    assert.ok(pro.every((item) => item.audience === "professionista"));
    const order = pro.map((item) => FAQ_TOPICS.professionista.indexOf(item.topic));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  it("faqByIds tiene l'ordine e segnala un id sbagliato", () => {
    assert.deepEqual(faqByIds(["registrazione", "quanto-costa"]).map((item) => item.id), ["registrazione", "quanto-costa"]);
    assert.throws(() => faqByIds(["non-esiste"]));
  });

  it("mesi e ricerca", () => {
    assert.equal(faqWithMonths("gratis per {mesi}", 1), "gratis per 1 mese");
    assert.equal(faqWithMonths("gratis per {mesi}", 3), "gratis per 3 mesi");
    assert.equal(normalizeFaqText("Perché l'IVA?"), "perche l iva");
  });
});

describe("domande in Contatti", () => {
  it("quelle di partenza esistono e possono stare in Contatti", () => {
    for (const audience of ["cliente", "professionista"] as const) {
      assert.equal(CONTACT_FAQ_DEFAULT[audience].length, CONTACT_FAQ_COUNT);
      for (const item of faqByIds(CONTACT_FAQ_DEFAULT[audience])) assert.ok(contactFaqEligible(item, audience), item.id);
    }
  });
  it("torna a quelle di partenza se le salvate non valgono più", () => {
    assert.deepEqual(contactFaqOrDefault("cliente", ["annullare", "come-pago", "lavoro-fatto-male"]), ["annullare", "come-pago", "lavoro-fatto-male"]);
    assert.deepEqual(contactFaqOrDefault("cliente", ["annullare", "non-esiste", "come-pago"]), [...CONTACT_FAQ_DEFAULT.cliente]);
    assert.deepEqual(contactFaqOrDefault("cliente", ["annullare", "limite-lavori", "come-pago"]), [...CONTACT_FAQ_DEFAULT.cliente]);
    assert.deepEqual(contactFaqOrDefault("professionista", null), [...CONTACT_FAQ_DEFAULT.professionista]);
  });
});
