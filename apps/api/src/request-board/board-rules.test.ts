import { describe, expect, it } from "vitest";
import { BOARD_MAX_QUOTES, provinceFromSlug, provinceSlug } from "@professionisti/shared";
import { boardCardOf, boardPlaceOf, boardTextIsClean, boardTradeOf, sortBoardCards, type BoardRow } from "./board-rules";

const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  id: "r1",
  boardTrade: "idraulico",
  boardTitle: "Perdita sotto il lavandino",
  boardSummary: "Gocciola dal sifone da qualche giorno.",
  boardPlace: "Padova",
  boardProvince: "PD",
  boardAt: new Date("2026-11-10T10:00:00Z"),
  serviceMode: "HOME",
  timing: "WEEK",
  photoCount: 3,
  quoteCount: 1,
  ...over,
});

describe("bacheca: luogo", () => {
  it("mostra il comune grande e solo la provincia per quello piccolo", () => {
    expect(boardPlaceOf("Padova")).toEqual({ place: "Padova", province: "PD" });
    expect(boardPlaceOf("Abano Terme")).toEqual({ place: "Abano Terme", province: "PD" });
    // Poche centinaia di abitanti.
    expect(boardPlaceOf("Agliè")?.place).toBe("Provincia di Torino");
  });
  it("niente scheda se la città non è un comune", () => {
    expect(boardPlaceOf("Casa mia")).toBeNull();
    expect(boardPlaceOf(null)).toBeNull();
  });
  it("le province hanno uno slug che torna indietro", () => {
    expect(provinceSlug("MB")).toBe("monza-e-brianza");
    expect(provinceFromSlug("monza-e-brianza")).toBe("MB");
    expect(provinceFromSlug("atlantide")).toBeNull();
  });
});

describe("bacheca: mestiere", () => {
  it("categoria per le richieste normali, chiave per quelle in attesa", () => {
    expect(boardTradeOf({ categorySlug: "idraulico", waitingTrade: null, waitingTradeKey: null })).toBe("idraulico");
    expect(boardTradeOf({ categorySlug: "tuttofare", waitingTrade: "Antennista", waitingTradeKey: "antennista" })).toBe("antennista");
    // Mestiere scritto dall'IA senza pagina: non entra (e non finisce tra i tuttofare).
    expect(boardTradeOf({ categorySlug: "tuttofare", waitingTrade: "Restauratore", waitingTradeKey: null })).toBeNull();
  });
});

describe("bacheca: testo", () => {
  it("rifiuta testi con contatti o segni della pulizia", () => {
    expect(boardTextIsClean("Scarico della doccia lento")).toBe(true);
    expect(boardTextIsClean("Chiamare al 333 123 4567")).toBe(false);
    expect(boardTextIsClean("Scrivere a mario@esempio.it")).toBe(false);
    expect(boardTextIsClean("Perdita in [indirizzo]")).toBe(false);
    expect(boardTextIsClean("Contattami su WhatsApp")).toBe(false);
    expect(boardTextIsClean("  ")).toBe(false);
  });
});

describe("bacheca: schede", () => {
  it("niente scheda con i posti finiti", () => {
    expect(boardCardOf(row({ quoteCount: BOARD_MAX_QUOTES }))).toBeNull();
    expect(boardCardOf(row({ quoteCount: BOARD_MAX_QUOTES - 1 }))?.quoteCount).toBe(BOARD_MAX_QUOTES - 1);
  });
  it("tempi in parole, mai 'Oggi'", () => {
    expect(boardCardOf(row())?.timing).toBe("In settimana");
    expect(boardCardOf(row({ timing: "TODAY" }))?.timing).toBeNull();
    expect(boardCardOf(row())?.tradeLabel).toBe("Idraulico");
  });
  it("prima quelle con meno preventivi, poi le più recenti", () => {
    const a = boardCardOf(row({ id: "a", quoteCount: 2, boardAt: new Date("2026-11-12T00:00:00Z") }))!;
    const b = boardCardOf(row({ id: "b", quoteCount: 0, boardAt: new Date("2026-11-09T00:00:00Z") }))!;
    const c = boardCardOf(row({ id: "c", quoteCount: 0, boardAt: new Date("2026-11-11T00:00:00Z") }))!;
    expect(sortBoardCards([a, b, c]).map((card) => card.id)).toEqual(["c", "b", "a"]);
  });
});
