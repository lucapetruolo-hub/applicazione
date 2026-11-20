import { test } from "node:test";
import assert from "node:assert/strict";
import { boardUncoveredAd, boardUncoveredInviteHref } from "./requestBoard";
import { BOARD_FROM_VALUES, BOARD_USE_ACTIONS, BOARD_USE_LABEL } from "./siteStats";

// Migliorie di Lavori cercati (docs/changelog/2026-11-20-migliorie-lavori-cercati.md).
test("annuncio di 'Dove mancano professionisti': mestiere, provincia, numero e link alla pagina", () => {
  const text = boardUncoveredAd({ province: "MB", provinceName: "Monza e Brianza", trade: "idraulico", tradeLabel: "Idraulico", count: 5 }, "https://esempio.it/");
  assert.match(text, /^Fai il lavoro di idraulico in provincia di Monza e Brianza\?/);
  assert.match(text, /5 clienti aspettano/);
  assert.match(text, /il prezzo lo decidi tu/);
  assert.ok(text.endsWith("https://esempio.it/lavora-con-noi/idraulico/monza-e-brianza"));
});

test("annuncio al singolare con una sola richiesta", () => {
  const text = boardUncoveredAd({ province: "LT", provinceName: "Latina", trade: "elettricista", tradeLabel: "Elettricista", count: 1 }, "https://esempio.it");
  assert.match(text, /1 cliente aspetta un preventivo/);
});

test("ogni 'da' dei link Rispondi ha il suo contatore e la sua scritta, avviso compreso", () => {
  assert.equal(BOARD_FROM_VALUES.avviso, "RISPONDI_AVVISO");
  for (const action of Object.values(BOARD_FROM_VALUES)) {
    assert.ok((BOARD_USE_ACTIONS as readonly string[]).includes(action));
    assert.ok(BOARD_USE_LABEL[action].length > 0);
  }
});

test("invito da 'Dove mancano professionisti': città solo se la provincia è anche un comune", () => {
  assert.equal(boardUncoveredInviteHref({ provinceName: "Latina", tradeLabel: "Idraulico" }), "/admin/professionisti?mestiere=Idraulico&citta=Latina");
  assert.equal(boardUncoveredInviteHref({ provinceName: "Monza e Brianza", tradeLabel: "Idraulico" }), "/admin/professionisti?mestiere=Idraulico");
});
