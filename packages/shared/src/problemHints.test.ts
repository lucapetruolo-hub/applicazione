import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comuneFromProblem, timingFromProblem } from "./problemHints";

describe("timingFromProblem", () => {
  it("riconosce le frasi chiare", () => {
    assert.equal(timingFromProblem("Perdita d'acqua urgente sotto il lavello"), "TODAY");
    assert.equal(timingFromProblem("mi serve subito un fabbro"), "TODAY");
    assert.equal(timingFromProblem("Imbiancare la camera, va bene anche domani"), "WEEK");
    assert.equal(timingFromProblem("Non è urgente, rifare il bagno"), "CALM");
    assert.equal(timingFromProblem("nessuna fretta per la cucina"), "CALM");
  });
  it("null se il testo non lo dice", () => {
    assert.equal(timingFromProblem("La lavatrice non scarica"), null);
    assert.equal(timingFromProblem("Rubinetto che gocciola da oggigiorno"), null);
  });
});

describe("comuneFromProblem", () => {
  it("prende il comune dopo a, in, zona", () => {
    assert.equal(comuneFromProblem("Perdita in bagno a Bologna"), "Bologna");
    assert.equal(comuneFromProblem("cerco idraulico zona sesto san giovanni"), "Sesto San Giovanni");
    assert.equal(comuneFromProblem("Abito a Pescara, tapparella bloccata"), "Pescara");
  });
  it("non scambia le stanze o le parole corte per un comune", () => {
    assert.equal(comuneFromProblem("Muffa in casa e in cucina"), null);
    assert.equal(comuneFromProblem("porta a vetri rotta"), null);
    assert.equal(comuneFromProblem("La caldaia non parte"), null);
  });
});
