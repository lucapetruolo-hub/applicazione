import { describe, expect, it } from "vitest";
import { isBotUserAgent, matchPopularServices, normalizeJobTerm, offersPopularService, ratioLabel, romeWeekStart } from "@professionisti/shared";
import {
  buildClientCohorts,
  buildGuideCells,
  buildGuideWeekly,
  buildMissingServices,
  buildPopularServices,
  buildProfessionalCohorts,
  buildSiteAdvice,
  greenWeeksInARow,
  guideOutcome,
  launchReady,
  reconcile,
  type SiteAdviceInput,
  type SiteRequestRow,
} from "./site-stats";

const NOW = new Date("2026-10-27T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => hoursAgo(d * 24);

let n = 0;
const request = (overrides: Partial<SiteRequestRow> = {}): SiteRequestRow => ({
  groupKey: `g${++n}`,
  clientId: `c${n}`,
  categorySlug: "idraulico",
  city: "Latina",
  createdAt: daysAgo(3),
  firstQuoteAt: null,
  deletedByClientAt: null,
  accepted: false,
  completed: false,
  reviewed: false,
  ...overrides,
});

const quoted = (createdAt: Date, afterHours: number) => request({ createdAt, firstQuoteAt: new Date(createdAt.getTime() + afterHours * 3_600_000) });

describe("numero guida", () => {
  it("conta il preventivo entro 24 ore, non dopo", () => {
    expect(guideOutcome(quoted(daysAgo(3), 5), NOW)).toBe("yes");
    expect(guideOutcome(quoted(daysAgo(3), 30), NOW)).toBe("no");
    expect(guideOutcome(request(), NOW)).toBe("no");
  });

  it("una richiesta nelle prime 24 ore senza preventivo non conta ancora", () => {
    expect(guideOutcome(request({ createdAt: hoursAgo(5) }), NOW)).toBeNull();
    expect(guideOutcome(quoted(hoursAgo(5), 1), NOW)).toBe("yes");
  });

  it("eliminata dal cliente prima delle 24 ore senza preventivo non conta", () => {
    const createdAt = daysAgo(3);
    expect(guideOutcome(request({ createdAt, deletedByClientAt: new Date(createdAt.getTime() + 3_600_000) }), NOW)).toBeNull();
    expect(guideOutcome(request({ createdAt, deletedByClientAt: daysAgo(1) }), NOW)).toBe("no");
  });

  it("caselle: prima le rosse, quelle piccole accorpate", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => request({ city: "Latina" })),
      quoted(daysAgo(2), 2),
      ...Array.from({ length: 3 }, () => quoted(daysAgo(2), 2)).map((r) => ({ ...r, categorySlug: "elettricista" })),
      request({ city: "Aprilia", categorySlug: "fabbro" }),
    ];
    const visible = [
      { city: "Latina", categorySlugs: ["idraulico"] },
      { city: "latina", categorySlugs: ["elettricista"] },
    ];
    const { cells, otherCells } = buildGuideCells(rows, [{ categorySlug: "pulizie", city: "latina", emptyCount: 4 }], visible, NOW);
    expect(cells.map((c) => [c.categorySlug, c.status, c.requests, c.withQuote])).toEqual([
      ["idraulico", "RED", 5, 1],
      ["pulizie", "NO_PROFESSIONALS", 0, 0],
      ["elettricista", "GREEN", 3, 3],
    ]);
    expect(cells[0]!.city).toBe("Latina");
    expect(otherCells).toEqual({ cells: 1, requests: 1, withQuote: 0 });
  });

  it("settimane: l'ultima è in corso e non conta per le settimane verdi", () => {
    const rows = [quoted(daysAgo(8), 1), quoted(daysAgo(15), 1), request({ createdAt: daysAgo(22) }), quoted(daysAgo(1), 1)];
    const weekly = buildGuideWeekly(rows, NOW, 4);
    expect(weekly.map((w) => [w.requests, w.withQuote])).toEqual([
      [1, 0],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    expect(greenWeeksInARow(weekly)).toBe(2);
  });
});

describe("coorti", () => {
  it("clienti: preventivo alla prima richiesta, lavoro, recensione, ritorno entro 90 giorni", () => {
    const first = daysAgo(10);
    const rows = [
      { ...quoted(first, 2), clientId: "a", groupKey: "a1", accepted: true, reviewed: true },
      { ...request({ createdAt: daysAgo(3) }), clientId: "a", groupKey: "a2" },
      { ...request({ createdAt: daysAgo(9) }), clientId: "b", groupKey: "b1" },
    ];
    const cohorts = buildClientCohorts(rows, new Map([["a", first], ["b", daysAgo(9)]]), NOW, 3);
    expect(cohorts[0]).toMatchObject({ clients: 2, withQuote: 1, accepted: 1, reviewed: 1, returned: 1 });
  });

  it("professionisti: primo preventivo entro 14 giorni", () => {
    const createdAt = daysAgo(5);
    const cohorts = buildProfessionalCohorts(
      [
        { createdAt, fiscalDone: true, identityDone: false, firstQuoteAt: daysAgo(1), activeLast30d: true },
        { createdAt, fiscalDone: false, identityDone: false, firstQuoteAt: null, activeLast30d: false },
      ],
      NOW,
      2,
    );
    expect(cohorts[0]).toMatchObject({ registered: 2, fiscal: 1, identity: 0, firstQuote: 1, active: 1 });
  });
});

const baseInput = (overrides: Partial<SiteAdviceInput> = {}): SiteAdviceInput => ({
  now: NOW,
  launch: new Date("2026-09-01T00:00:00Z"),
  cells: [],
  searchZones: [],
  requestSteps: [],
  profileViews: 0,
  failures: [],
  unknownJobs: [],
  popularServices: [],
  missingServices: [],
  contacts: [],
  services: [],
  churnReasons: [],
  stalled: [],
  silent: [],
  launchStatus: { visibleProfessionals: 0, clientsWithRequest: 0, acceptedJobs: 0, paidOnline: 0, greenWeeks: 0, ready: false },
  reconciliation: { days: 14, counted: 10, saved: 10, ok: true },
  requestsInWindow: 5,
  prices: { paying: 0, atLimit30d: 0, trialsEnded: 0, trialsConverted: 0 },
  ...overrides,
});

describe("consigli", () => {
  it("profili molto visti ma senza richieste: completarli", () => {
    const lavoro = (fromProfile: number) => [{ key: "LAVORO" as const, count: 20, fromProfile }];
    expect(buildSiteAdvice(baseInput({ profileViews: 90, requestSteps: lavoro(0) }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ profileViews: 200, requestSteps: lavoro(10) }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ profileViews: 200, requestSteps: lavoro(2) }))[0]).toMatchObject({ key: "profiles-no-requests", level: "TIP" });
  });

  it("un avviso spento da più del 20%: consiglio, ma solo con abbastanza persone", () => {
    const row = { key: "preventivi.date", label: "Date proposte", level: "item" as const, siteOff: 1, emailOff: 6, emailOffByDefault: false, emailOn: 0, hasSite: true, hasEmail: true };
    const group = (people: number) => [{ role: "professional" as const, people, digestOff: 0, quietNightOff: 0, urgentAtNight: 0, rows: [row] }];
    expect(buildSiteAdvice(baseInput({ notificationOptOuts: group(25) }))).toEqual([
      expect.objectContaining({ key: "notification-opt-out:professional:preventivi.date:email", title: "Il 24% dei professionisti ha spento le email di «Date proposte»" }),
    ]);
    expect(buildSiteAdvice(baseInput({ notificationOptOuts: group(15) }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ notificationOptOuts: group(40) }))).toEqual([]);
  });

  it("niente da fare: nessun consiglio", () => {
    expect(buildSiteAdvice(baseInput())).toEqual([]);
  });

  it("casella rossa: reclutare, in parole semplici e prima di tutto", () => {
    const advice = buildSiteAdvice(
      baseInput({
        cells: [{ categorySlug: "idraulico", categoryLabel: "Idraulico", city: "Latina", requests: 9, withQuote: 2, emptySearches: 0, professionals: 1, status: "RED" }],
        unknownJobs: [{ term: "antennista", days: 4, searches: 6 }],
      }),
    );
    expect(advice[0]).toMatchObject({ level: "URGENT", title: "Idraulico a Latina: servono più professionisti" });
    expect(advice[0]!.why).toContain("2 su 9");
    expect(advice[1]).toMatchObject({ level: "TIP", title: "Cercano «antennista», un lavoro che non c'è" });
  });

  it("ricerche senza nessuno vicino: un consiglio solo se la casella non è già da reclutare", () => {
    const zone = { categoryLabel: "Idraulico", city: "Latina", searches: 8, empty: 6 };
    const red = { categorySlug: "idraulico", categoryLabel: "Idraulico", city: "Latina", requests: 3, withQuote: 0, emptySearches: 6, professionals: 0, status: "NO_PROFESSIONALS" as const };
    expect(buildSiteAdvice(baseInput({ cells: [red], searchZones: [zone] })).map((a) => a.key)).toEqual(["recruit:idraulico:latina"]);
    expect(buildSiteAdvice(baseInput({ searchZones: [zone] })).map((a) => a.key)).toEqual(["search:idraulico:latina"]);
  });

  it("passo della richiesta: solo con almeno 30 persone e metà che si ferma", () => {
    const steps = (lavoro: number, dove: number) => [
      { key: "LAVORO" as const, count: lavoro, fromProfile: 0 },
      { key: "DOVE" as const, count: dove, fromProfile: 0 },
    ];
    expect(buildSiteAdvice(baseInput({ requestSteps: steps(20, 2) }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ requestSteps: steps(40, 25) }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ requestSteps: steps(40, 10) }))[0]).toMatchObject({ title: "Molti si fermano al passo «Il lavoro» della richiesta" });
  });

  it("errori del sito: urgente da 5 in una settimana", () => {
    const advice = buildSiteAdvice(baseInput({ failures: [{ form: "RICHIESTA", kind: "SERVER", count: 5 }] }));
    expect(advice[0]).toMatchObject({ level: "URGENT", title: "Richiesta di preventivo: l'invio non riesce" });
  });

  it("professionisti da chiamare, con i nomi", () => {
    const advice = buildSiteAdvice(
      baseInput({
        stalled: [{ name: "Rossi Idraulica", step: "FISCAL", days: 12, href: "/admin/utenti?q=rossi" }],
        silent: [{ name: "Bianchi Luce", requests: 4, href: "/admin/utenti?q=bianchi" }],
      }),
    );
    expect(advice.map((a) => a.title)).toEqual(["1 professionista non risponde alle richieste", "1 professionista è fermo a metà iscrizione"]);
    expect(advice[1]!.items?.[0]).toMatchObject({ label: "Rossi Idraulica", detail: "Mancano i dati fiscali · iscritto da 12 giorni" });
  });

  it("prezzi: niente consigli prima di 3 mesi dal lancio e 30 paganti", () => {
    const prices = { paying: 40, atLimit30d: 20, trialsEnded: 20, trialsConverted: 2 };
    expect(buildSiteAdvice(baseInput({ prices, launch: new Date("2026-10-01T00:00:00Z") }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ prices: { ...prices, paying: 20 }, launch: new Date("2026-06-01T00:00:00Z") }))).toEqual([]);
    expect(buildSiteAdvice(baseInput({ prices, launch: new Date("2026-06-01T00:00:00Z") })).map((a) => a.key)).toEqual(["price:limit", "price:trial"]);
  });

  it("aprire a Google quando la tappa silenziosa è raggiunta", () => {
    const status = { visibleProfessionals: 10, clientsWithRequest: 10, acceptedJobs: 5, paidOnline: 1, greenWeeks: 4 };
    expect(launchReady(status)).toBe(true);
    expect(launchReady({ ...status, greenWeeks: 3 })).toBe(false);
    expect(buildSiteAdvice(baseInput({ launchStatus: { ...status, ready: true } }))[0]!.key).toBe("google-ready");
  });

  it("nessuna richiesta dopo il lancio: lo dice", () => {
    expect(buildSiteAdvice(baseInput({ requestsInWindow: 0 })).map((a) => a.key)).toEqual(["no-requests"]);
    expect(buildSiteAdvice(baseInput({ requestsInWindow: 0, launch: null }))).toEqual([]);
  });

  it("nelle prime 4 settimane dopo il lancio il testo dice \"dal lancio\" (§395)", () => {
    const [old] = buildSiteAdvice(baseInput({ requestsInWindow: 0 }));
    expect(old!.title).toBe("Nelle ultime 4 settimane nessuna richiesta di preventivo");
    const [recent] = buildSiteAdvice(baseInput({ requestsInWindow: 0, launch: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000) }));
    expect(recent!.title).toBe("Dal lancio nessuna richiesta di preventivo");
  });
});

describe("conti d'appoggio", () => {
  it("confronto dei conteggi: torna entro 2 o il 10%", () => {
    expect(reconcile(9, 10, 14).ok).toBe(true);
    expect(reconcile(40, 50, 14).ok).toBe(true);
    expect(reconcile(30, 50, 14).ok).toBe(false);
    expect(reconcile(55, 50, 14).ok).toBe(true);
    expect(reconcile(60, 50, 14).ok).toBe(false);
  });

  it("percentuale solo da 30 casi", () => {
    expect(ratioLabel(7, 9)).toBe("7 su 9");
    expect(ratioLabel(21, 30)).toBe("70%");
    expect(ratioLabel(0, 0)).toBe("—");
  });

  it("robot e browser senza schermo non contano", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });

  it("parole cercate: solo quelle che possono essere un lavoro", () => {
    expect(normalizeJobTerm("  Antennista ")).toBe("antennista");
    expect(normalizeJobTerm("tecnico  caldaie")).toBe("tecnico caldaie");
    expect(normalizeJobTerm("3331234567")).toBeNull();
    expect(normalizeJobTerm("mario@rossi.it")).toBeNull();
    expect(normalizeJobTerm("ho bisogno di un idraulico subito")).toBeNull();
    expect(normalizeJobTerm("ab")).toBeNull();
  });

  it("settimana: il lunedì in ora di Roma", () => {
    expect(romeWeekStart(new Date("2026-10-27T12:00:00Z"))).toBe("2026-10-26");
    expect(romeWeekStart(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(romeWeekStart(new Date("2026-10-25T21:30:00Z"))).toBe("2026-10-19");
  });
});

describe("prestazioni più cercate", () => {
  it("una ricerca trova la prestazione dell'elenco, mai il testo scritto", () => {
    expect(matchPopularServices("sturatura", "idraulico")).toEqual([{ categorySlug: "idraulico", service: "Sturatura scarichi" }]);
    expect(matchPopularServices("Perdite d'acqua")).toContainEqual({ categorySlug: "idraulico", service: "Riparazione perdita d'acqua" });
    expect(matchPopularServices("rubinet", "idraulico")).toEqual([{ categorySlug: "idraulico", service: "Sostituzione rubinetteria" }]);
    expect(matchPopularServices("mario rossi via roma 3")).toEqual([]);
    expect(matchPopularServices("sturatura", "elettricista")).toEqual([]);
  });

  it("una parola troppo generica non conta", () => {
    expect(matchPopularServices("riparazione")).toEqual([]);
    expect(matchPopularServices("di")).toEqual([]);
  });

  it("chi offre la prestazione, anche scritta più lunga", () => {
    expect(offersPopularService("Sturatura scarichi e tubi", "Sturatura scarichi")).toBe(true);
    expect(offersPopularService("Sturature", "Sturatura scarichi")).toBe(false);
  });

  it("cercate per lavoro, con quanti la offrono", () => {
    const result = buildPopularServices(
      [
        { categorySlug: "idraulico", service: "Sturatura scarichi", searches: 12 },
        { categorySlug: "idraulico", service: "Installazione scaldabagno", searches: 3 },
        { categorySlug: "idraulico", service: "Non in elenco", searches: 50 },
      ],
      [
        { profileId: "p1", name: "Sturatura scarichi", categorySlugs: ["idraulico"] },
        { profileId: "p2", name: "sturatura scarichi cucina", categorySlugs: ["idraulico", "tuttofare"] },
        { profileId: "p3", name: "Sturatura scarichi", categorySlugs: ["tuttofare"] },
      ],
    );
    expect(result).toEqual([
      {
        categorySlug: "idraulico",
        categoryLabel: "Idraulico",
        services: [
          { service: "Sturatura scarichi", searches: 12, offeredBy: 2 },
          { service: "Installazione scaldabagno", searches: 3, offeredBy: 0 },
        ],
      },
    ]);
  });

  it("scritte a mano da 3 professionisti e non suggerite", () => {
    const rows = [
      { profileId: "p1", name: "Montaggio tende", categorySlugs: ["tuttofare"] },
      { profileId: "p2", name: "montaggio  tende", categorySlugs: ["tuttofare", "imbianchino"] },
      { profileId: "p3", name: "Montaggio tende!", categorySlugs: ["imbianchino", "tuttofare"] },
      { profileId: "p3", name: "Montaggio tende", categorySlugs: ["imbianchino", "tuttofare"] },
      { profileId: "p1", name: "Sturatura scarichi", categorySlugs: ["idraulico"] },
      { profileId: "p2", name: "Sturatura scarichi", categorySlugs: ["idraulico"] },
      { profileId: "p3", name: "Sturatura scarichi", categorySlugs: ["idraulico"] },
      { profileId: "p4", name: "Lucidatura parquet", categorySlugs: ["pulizie"] },
    ];
    expect(buildMissingServices(rows)).toEqual([{ categorySlug: "tuttofare", categoryLabel: "Tutto Fare", name: "Montaggio tende", professionals: 3 }]);
    // Aggiunta alle standard da "Prestazioni per mestiere" (§388): non manca più.
    expect(buildMissingServices(rows, { tuttofare: ["Montaggio tende"] })).toEqual([]);
  });

  it("diventano consigli solo sopra le soglie", () => {
    const advice = buildSiteAdvice(
      baseInput({
        popularServices: [
          {
            categorySlug: "idraulico",
            categoryLabel: "Idraulico",
            services: [
              { service: "Sturatura scarichi", searches: 12, offeredBy: 1 },
              { service: "Installazione scaldabagno", searches: 30, offeredBy: 5 },
              { service: "Sostituzione caldaia", searches: 4, offeredBy: 0 },
            ],
          },
        ],
        missingServices: [{ categorySlug: "tuttofare", categoryLabel: "Tutto Fare", name: "Montaggio tende", professionals: 3 }],
      }),
    );
    const keys = advice.map((a) => a.key);
    expect(keys).toContain("service-gap:idraulico:sturatura scarichi");
    expect(keys).toContain("missing-service:tuttofare:montaggio tende");
    expect(keys.filter((k) => k.startsWith("service-gap:"))).toHaveLength(1);
  });

  it("pochi la offrono: elenca chi chiamare tra i professionisti di quel lavoro che non la fanno", () => {
    const gap = (offeredBy: number) => [
      { categorySlug: "idraulico", categoryLabel: "Idraulico", services: [{ service: "Sturatura scarichi", searches: 12, offeredBy }] },
    ];
    const contact = (id: string, name: string, city: string, categorySlugs = ["idraulico"]) => ({ id, name, city, href: `/admin/utenti?q=${id}`, categorySlugs });
    const advice = buildSiteAdvice(
      baseInput({
        popularServices: gap(1),
        contacts: [contact("a", "Rossi", "Sezze"), contact("b", "Bianchi", "Latina"), contact("c", "Verdi", "Latina"), contact("d", "Neri", "Latina", ["elettricista"])],
        services: [{ profileId: "c", name: "Sturatura scarichi e tubi", categorySlugs: ["idraulico"] }],
      }),
    ).find((a) => a.key.startsWith("service-gap:"));
    expect(advice?.items).toEqual([
      { label: "Bianchi", detail: "Latina", href: "/admin/utenti?q=b" },
      { label: "Rossi", detail: "Sezze", href: "/admin/utenti?q=a" },
    ]);
    expect(advice?.todo).toMatch(/^Chiama questi professionisti di Idraulico/);

    const none = buildSiteAdvice(baseInput({ popularServices: gap(0) })).find((a) => a.key.startsWith("service-gap:"));
    expect(none?.items).toBeUndefined();
    expect(none?.link?.href).toBe("/admin/professionisti");
  });
});
