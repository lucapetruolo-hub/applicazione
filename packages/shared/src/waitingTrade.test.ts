import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guidedRequestSchema } from "./schemas";
import {
  countRequestedTrades,
  waitingInviteBio,
  waitingInviteHref,
  groupWaitingRequests,
  textsMatchWaitingTrade,
  waitingTradeAd,
  waitingTradeKeywords,
  waitingTradeName,
  type WaitingRequestAdminRow,
} from "./waitingTrade";

// Richieste in attesa di un mestiere (docs/changelog/2026-11-17-richieste-in-attesa.md).
describe("waitingTradeName", () => {
  it("usa il nome fisso degli 8 lavori fuori servizio", () => {
    assert.equal(
      waitingTradeName({ key: "antennista", name: "qualunque" }),
      "Antennista",
    );
  });
  it("ripulisce il nome scritto dall'IA e scarta i mestieri del sito", () => {
    assert.equal(
      waitingTradeName({ name: " «restauratore di mobili» " }),
      "Restauratore di mobili",
    );
    assert.equal(waitingTradeName({ name: "Idraulico" }), null);
    assert.equal(waitingTradeName({ name: "<script>" }), null);
    assert.equal(waitingTradeName({}), null);
  });
});

describe("waitingTradeKeywords e textsMatchWaitingTrade", () => {
  it("riconosce chi scrive il mestiere nelle prestazioni", () => {
    const keywords = waitingTradeKeywords({ key: "antennista" });
    assert.ok(
      textsMatchWaitingTrade(keywords, ["Installazione ANTENNA TV", null]),
    );
    assert.ok(
      !textsMatchWaitingTrade(keywords, ["Rifacimento impianto elettrico"]),
    );
  });
  it("senza parole non riconosce nessuno", () => {
    assert.equal(textsMatchWaitingTrade([], ["antenna"]), false);
    assert.deepEqual(waitingTradeKeywords({ name: "Tecnico" }), []);
  });
});

describe("guidedRequestSchema con un mestiere in attesa", () => {
  const base = {
    categorySlug: "tuttofare",
    description: "Antenna storta sul tetto, non si vede più nessun canale.",
    city: "Bari",
    serviceMode: "ONLINE",
  };
  it("va bene per una richiesta generale", () => {
    assert.ok(
      guidedRequestSchema.safeParse({ ...base, waitingTradeKey: "antennista" })
        .success,
    );
  });
  it("non va con un professionista scelto o più mestieri", () => {
    assert.ok(
      !guidedRequestSchema.safeParse({
        ...base,
        waitingTradeKey: "antennista",
        professionalProfileId: "6d3b7f2a-1c4e-4b8a-9f00-1234567890ab",
      }).success,
    );
    assert.ok(
      !guidedRequestSchema.safeParse({
        ...base,
        waitingTrade: "Sarto",
        extraCategorySlugs: ["idraulico"],
      }).success,
    );
  });
});

describe("groupWaitingRequests e waitingTradeAd", () => {
  const row = (
    id: string,
    trade: string,
    zone: string,
    createdAt: string,
    state: WaitingRequestAdminRow["state"] = "WAITING",
  ): WaitingRequestAdminRow => ({
    id,
    trade,
    description: "",
    city: "",
    zone,
    state,
    recipients: 0,
    createdAt,
    expiresAt: null,
    stillNeededAskedAt: null,
  });
  it("conta solo quelle senza nessuno, per mestiere e zona", () => {
    const groups = groupWaitingRequests([
      row("1", "Antennista", "Bari e provincia", "2026-11-03T00:00:00Z"),
      row("2", "antennista", "Bari e provincia", "2026-11-01T00:00:00Z"),
      row(
        "3",
        "Antennista",
        "Bari e provincia",
        "2026-10-01T00:00:00Z",
        "SENT",
      ),
      row("4", "Spurghi", "Roma e provincia", "2026-11-02T00:00:00Z"),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.trade, g.zone, g.waiting, g.oldestCreatedAt]),
      [
        ["Antennista", "Bari e provincia", 2, "2026-11-01T00:00:00Z"],
        ["Spurghi", "Roma e provincia", 1, "2026-11-02T00:00:00Z"],
      ],
    );
  });
  it("l'annuncio dice mestiere, zona e numero, senza promesse sul lavoro", () => {
    const ad = waitingTradeAd(
      { trade: "Antennista", zone: "Bari e provincia", waiting: 4 },
      "https://esempio.it/",
    );
    assert.match(ad, /antennista \(Bari e provincia\)/);
    assert.match(ad, /4 clienti aspettano un preventivo/);
    assert.match(ad, /il prezzo lo decidi tu/);
    assert.match(ad, /https:\/\/esempio\.it\/per-professionisti$/);
    assert.doesNotMatch(ad, /garantiamo|nostri professionisti|gratis/i);
  });
});

describe("countRequestedTrades", () => {
  it("conta senza maiuscole, i più chiesti prima, con le zone", () => {
    assert.deepEqual(
      countRequestedTrades([
        { trade: "Antennista", zone: "Bari e provincia" },
        { trade: "antennista", zone: "Bari e provincia" },
        { trade: "Fabbro", zone: "Roma e provincia" },
        { trade: null, zone: "Roma e provincia" },
        { trade: "", zone: "Roma e provincia" },
        { trade: "Arrotino", zone: "Senza città" },
        { trade: "ANTENNISTA", zone: "Lecce e provincia" },
        { trade: "Arrotino", zone: "Senza città" },
      ]),
      [
        {
          trade: "Antennista",
          requests: 3,
          zones: [
            { zone: "Bari", requests: 2 },
            { zone: "Lecce", requests: 1 },
          ],
        },
        {
          trade: "Arrotino",
          requests: 2,
          zones: [{ zone: "Senza città", requests: 2 }],
        },
        {
          trade: "Fabbro",
          requests: 1,
          zones: [{ zone: "Roma", requests: 1 }],
        },
      ],
    );
  });
});

describe("invito precompilato", () => {
  it("apre il modulo con il comune della zona e il mestiere", () => {
    assert.equal(
      waitingInviteHref({ trade: "Antennista", zone: "Bari e provincia" }),
      "/admin/professionisti?mestiere=Antennista&citta=Bari",
    );
    assert.equal(
      waitingInviteHref({ trade: "Antennista", zone: "Senza città" }),
      "/admin/professionisti?mestiere=Antennista",
    );
  });
  it("la presentazione di partenza basta a far arrivare le richieste in attesa", () => {
    for (const trade of [
      { key: "antennista" as const, name: "Antennista" },
      { name: "Restauratore di mobili" },
    ]) {
      const name = waitingTradeName(trade)!;
      assert.ok(
        textsMatchWaitingTrade(waitingTradeKeywords(trade), [
          waitingInviteBio(name),
        ]),
        name,
      );
    }
  });
});
