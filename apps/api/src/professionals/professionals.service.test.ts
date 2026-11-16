import { canonicalServiceName } from "@professionisti/shared";
import { describe, expect, it, vi } from "vitest";
import { ProfessionalsService, servicesFirstFor } from "./professionals.service";

/**
 * Flusso critico (CEO, tattico — "gate contatti cliente"): principio fisso
 * di CLAUDE.md §5.9 / "Verbale Cognitivo" F6.3, invertito tre volte in
 * passato prima che esistesse una regola scritta a fermare l'oscillazione.
 * Telefono, email e indirizzo del cliente NON devono mai comparire nella
 * risposta di `getMyLeads` (richieste ricevute, prima di un impegno
 * reciproco confermato) anche quando Prisma restituisce il record cliente
 * completo (la query fa `include: { client: true }` — l'unica barriera è la
 * mappatura verso il DTO qui sotto, quindi una regressione qui è silenziosa
 * finché non la si verifica esplicitamente).
 */
function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1" }) },
    lead: { findMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    quote: { groupBy: vi.fn().mockResolvedValue([]) },
    conversationEvent: { findMany: vi.fn().mockResolvedValue([]) },
    booking: { findMany: vi.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };
  const service = new ProfessionalsService(
    prisma as never,
    {} as never, // geocodingService — non usato da getMyLeads
    {} as never, // notificationsService
    {} as never, // guidedRequestsService
    {} as never, // professionalMetricsService
    {} as never, // timelineService
    {} as never, // subscriptionsService
    {} as never, // professionalVerificationService
    {} as never, // agendaService
    {} as never, // serviceNamesService
  );
  return { service, prisma };
}

const CLIENT_WITH_FULL_CONTACT_INFO = {
  id: "client-1",
  name: "Mario",
  surname: "Rossi",
  birthDate: new Date("1990-01-01"),
  imageUrl: "https://img.example/mario.jpg",
  phone: "3331234567",
  email: "mario.rossi@example.com",
  address: "Via Segreta 42",
};

function buildLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    status: "PENDING",
    declineNote: null,
    professionalNote: null,
    priceEurCents: 500,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    guidedRequest: {
      id: "gr-1",
      category: { label: "Idraulico" },
      client: CLIENT_WITH_FULL_CONTACT_INFO,
      description: "Perdita sotto il lavandino",
      city: "Latina",
      quotes: [],
      chosenProfileIds: [],
    },
    ...overrides,
  };
}

describe("ProfessionalsService.getMyLeads — gate contatti cliente", () => {
  it("non espone mai telefono/email/indirizzo del cliente prima che il preventivo sia accettato", async () => {
    const { service, prisma } = buildService();
    (prisma.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([buildLead()]);

    const leads = await service.getMyLeads("pro-user-1");
    const lead = leads[0];
    expect(lead).toBeDefined();

    const serialized = JSON.stringify(lead);
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.phone);
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.email);
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.address);
    // Nome e data di nascita restano invece visibili fin da subito
    // (richiesta esplicita dell'utente per la scheda cliente); il cognome
    // no, si sblocca col preventivo accettato (docs/CHANGELOG.md §216).
    expect(lead!.guidedRequest.clientName).toBe("Mario");
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.surname);
    expect(lead!.guidedRequest).not.toHaveProperty("clientBirthDate");
    expect(lead!.guidedRequest.clientImageUrl).toBeNull();
    expect(lead!.guidedRequest.clientDetailsUnlocked).toBe(false);
    expect(lead!.guidedRequest).not.toHaveProperty("clientPhone");
    expect(lead!.guidedRequest).not.toHaveProperty("clientEmail");
    expect(lead!.guidedRequest).not.toHaveProperty("clientAddress");
  });

  it("resta valido anche quando il preventivo è già stato accettato (Lead invariato, il contatto arriva da getMyBookings)", async () => {
    // Anche a preventivo accettato, getMyLeads stesso non deve iniziare a
    // esporre il contatto: quel dato arriva solo da getMyBookings una volta
    // che esiste una Booking — due endpoint distinti, non un ramo condizionale
    // nello stesso endpoint.
    const { service, prisma } = buildService();
    (prisma.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildLead({ guidedRequest: { ...buildLead().guidedRequest, quotes: [{ id: "q-1", status: "ACCEPTED", items: [], booking: { status: "CONFIRMED" }, createdAt: new Date(), updatedAt: new Date(), estimatedStartDate: new Date(), estimatedEndDate: null, clientProposedDate: null, clientProposedEndDate: null, clientProposedNote: null, notes: null }] } }),
    ]);

    const leads = await service.getMyLeads("pro-user-1");
    const lead = leads[0];
    expect(lead).toBeDefined();

    const serialized = JSON.stringify(lead);
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.phone);
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.email);
    expect(serialized).not.toContain(CLIENT_WITH_FULL_CONTACT_INFO.address);
    // Il cognome invece si sblocca con la Booking, come chiesto (§216).
    expect(lead!.guidedRequest.clientName).toBe("Mario Rossi");
    expect(lead!.guidedRequest.clientImageUrl).toBe("https://img.example/mario.jpg");
    expect(lead!.guidedRequest.clientDetailsUnlocked).toBe(true);
    expect(serialized).not.toContain("1990-01-01");
  });
});

describe("ProfessionalsService.getMyLeads — concorrenti che hanno già risposto (docs/CHANGELOG.md §147)", () => {
  it("conta solo gli altri professionisti e i loro preventivi, mai chi sono", async () => {
    const { service, prisma } = buildService({
      lead: {
        findMany: vi.fn().mockResolvedValue([buildLead()]),
        groupBy: vi.fn().mockResolvedValue([{ guidedRequestId: "gr-1", _count: { _all: 3 } }]),
      },
      quote: { groupBy: vi.fn().mockResolvedValue([{ guidedRequestId: "gr-1", _count: { _all: 2 } }]) },
    });
    const leads = await service.getMyLeads("pro-user-1");
    expect(leads[0]!.competitors).toEqual({ responded: 2, total: 2 });
    // Richiesta generale: bollino "A più professionisti" (docs/changelog/2026-11-10-richiesta-solo-per-te.md).
    expect(leads[0]!.audience).toEqual({ kind: "shared" });
    expect(prisma.quote.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ professionalProfileId: { not: "pro-1" }, status: { not: "WITHDRAWN" } }) }),
    );
  });
});

describe("ProfessionalsService.getMyLeads — inoltro di una richiesta diretta (docs/CHANGELOG.md §209)", () => {
  const forwardAt = new Date("2026-10-11T11:00:00Z");
  const direct = (extra: Record<string, unknown> = {}) =>
    buildLead({ guidedRequest: { ...buildLead().guidedRequest, professionalProfileId: "pro-1", forwardAt, forwardedAt: null, ...extra } });

  it("mostra quando parte l'inoltro al professionista scelto che non ha ancora risposto", async () => {
    const { service, prisma } = buildService();
    (prisma.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([direct()]);
    const leads = await service.getMyLeads("pro-user-1");
    expect(leads[0]!.forwardAt).toBe(forwardAt.toISOString());
    expect(leads[0]!.audience).toEqual({ kind: "direct" });
  });

  it("niente inoltro da mostrare se ha già scritto in chat o la richiesta è già stata inoltrata", async () => {
    const chatted = buildService({ conversationEvent: { findMany: vi.fn().mockResolvedValue([{ guidedRequestId: "gr-1" }]) } });
    (chatted.prisma.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([direct()]);
    expect((await chatted.service.getMyLeads("pro-user-1"))[0]!.forwardAt).toBeNull();

    const forwarded = buildService();
    (forwarded.prisma.lead.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([direct({ forwardedAt: new Date() })]);
    const [forwardedLead] = await forwarded.service.getMyLeads("pro-user-1");
    expect(forwardedLead!.forwardAt).toBeNull();
    // Il bollino passa da "Solo per te" a "Inoltrata anche ad altri".
    expect(forwardedLead!.audience).toEqual({ kind: "direct_forwarded" });
  });
});

describe("ProfessionalsService.deleteLead — nasconde, non cancella (docs/CHANGELOG.md §143)", () => {
  function buildDeleteService(lead: Record<string, unknown>, closedQuote: unknown = null) {
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1" }) },
      lead: {
        findUnique: vi.fn().mockResolvedValue({
          id: "lead-1",
          professionalProfileId: "pro-1",
          guidedRequestId: "gr-1",
          status: "PENDING",
          guidedRequest: { client: { deletedAt: null } },
          ...lead,
        }),
        update: vi.fn().mockReturnValue("lead-update"),
        delete: vi.fn(),
      },
      quote: { findFirst: vi.fn().mockResolvedValue(closedQuote) },
      guidedRequestUserState: { upsert: vi.fn().mockReturnValue("state-upsert") },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const service = new ProfessionalsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it.each(["EXPIRED", "DECLINED"])("nasconde un lead %s e silenzia le sue notifiche, senza cancellarlo", async (status) => {
    const { service, prisma } = buildDeleteService({ status });
    await service.deleteLead("user-1", "lead-1");
    expect(prisma.lead.delete).not.toHaveBeenCalled();
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: "lead-1" }, data: { hiddenByProfessionalAt: expect.any(Date) } });
    expect(prisma.guidedRequestUserState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_guidedRequestId: { userId: "user-1", guidedRequestId: "gr-1" } } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(["lead-update", "state-upsert"]);
  });

  it("nasconde un lead con preventivo ritirato o rifiutato dal cliente", async () => {
    const { service, prisma } = buildDeleteService({ status: "PENDING" }, { id: "quote-1" });
    await service.deleteLead("user-1", "lead-1");
    expect(prisma.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["WITHDRAWN", "REJECTED"] } }) }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("rifiuta una richiesta ancora attiva (da quotare, in attesa, accettata)", async () => {
    const { service, prisma } = buildDeleteService({ status: "PENDING" }, null);
    await expect(service.deleteLead("user-1", "lead-1")).rejects.toThrow("Puoi eliminare solo una richiesta scaduta o chiusa.");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rifiuta il lead di un altro professionista", async () => {
    const { service } = buildDeleteService({ professionalProfileId: "pro-2", status: "EXPIRED" });
    await expect(service.deleteLead("user-1", "lead-1")).rejects.toThrow("Questa richiesta non è tua.");
  });
});

describe("agenda pubblica (§293)", () => {
  const visible = { deletedAt: null, suspendedAt: null, invitePendingAt: null, pausedAt: null, requestsBlockedUntil: null, isDemo: true, fiscalProfile: null };
  const build = (profile: unknown) => {
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      availabilitySlot: { findMany: vi.fn().mockResolvedValue([]) },
      booking: { findMany: vi.fn().mockResolvedValue([]) },
      externalJob: { findMany: vi.fn().mockResolvedValue([]) },
      availabilityException: { findMany: vi.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new ProfessionalsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never) };
  };

  it("non esiste per un profilo eliminato o sospeso", async () => {
    await expect(build({ ...visible, deletedAt: new Date() }).service.getPublicAgenda("p-1")).rejects.toThrow("Professionista non trovato.");
    await expect(build({ ...visible, suspendedAt: new Date() }).service.getPublicAgenda("p-1")).rejects.toThrow("Professionista non trovato.");
  });

  it("nessuna fascia per un profilo in pausa", async () => {
    const { service, prisma } = build({ ...visible, pausedAt: new Date() });
    await expect(service.getPublicAgenda("p-1")).resolves.toEqual({ days: [] });
    expect(prisma.availabilitySlot.findMany).not.toHaveBeenCalled();
  });

  it("mostra i giorni di un profilo visibile", async () => {
    const { days } = await build(visible).service.getPublicAgenda("p-1");
    expect(days.length).toBeGreaterThan(0);
  });
});

describe("voci di \"Quanto costa in media\" (§398)", () => {
  const build = (services: { professionalProfileId: string; name: string }[]) => {
    const prisma = {
      professionalService: { findMany: vi.fn().mockResolvedValue(services) },
      professionalProfile: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const serviceNames = { canonicalizer: async () => canonicalServiceName };
    return { prisma, service: new ProfessionalsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, serviceNames as never) };
  };

  it("cerca chi ha la prestazione, sinonimi compresi, senza badare a maiuscole e spazi", async () => {
    const { prisma, service } = build([
      { professionalProfileId: "p-1", name: " Tinteggiatura " },
      { professionalProfileId: "p-2", name: "Imbiancatura interni" },
      { professionalProfileId: "p-3", name: "tinteggiatura" },
      { professionalProfileId: "p-4", name: "Tinteggiatura esterni" },
    ]);
    await service.search({ service: "Tinteggiatura interni" });
    const where = prisma.professionalProfile.findMany.mock.calls[0]![0].where;
    expect(where.AND).toContainEqual({ id: { in: ["p-1", "p-2", "p-3"] } });
  });

  it("il prezzo medio conta solo chi compare nella ricerca", async () => {
    const { prisma, service } = build([]);
    await expect(service.getServicePriceIndex()).resolves.toEqual([]);
    const profileWhere = prisma.professionalService.findMany.mock.calls[0]![0].where.professionalProfile;
    expect(profileWhere).toMatchObject({ isDemo: false, user: { testAccountAt: null }, deletedAt: null, suspendedAt: null, pausedAt: null, invitePendingAt: null });
  });
});

describe("Metti in pausa (collaudo C-16)", () => {
  function build() {
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "p-1" }), update: vi.fn().mockResolvedValue({ id: "p-1" }) },
    };
    const guided = { matchWhenVisible: vi.fn() };
    const service = new ProfessionalsService(prisma as never, {} as never, {} as never, guided as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { service, prisma, guided };
  }
  const now = new Date("2026-11-02T10:00:00.000Z");

  it("salva il giorno di ritorno e riprende con null", async () => {
    const { service, prisma, guided } = build();
    await expect(service.setAway("u-1", { until: "2026-11-10" }, now)).resolves.toEqual({ awayUntil: "2026-11-10T00:00:00.000Z" });
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { userId: "u-1" },
      data: { awayUntil: new Date("2026-11-10T00:00:00.000Z"), awayReminderSentAt: null },
      select: { id: true },
    });
    expect(guided.matchWhenVisible).not.toHaveBeenCalled();
    await expect(service.setAway("u-1", { until: null }, now)).resolves.toEqual({ awayUntil: null });
    // "Riprendi ora": subito le richieste ancora aperte della zona.
    expect(guided.matchWhenVisible).toHaveBeenCalledWith("p-1");
  });

  it("non oggi né nel passato, non oltre 180 giorni", async () => {
    const { service } = build();
    await expect(service.setAway("u-1", { until: "2026-11-02" }, now)).rejects.toThrow("da domani");
    await expect(service.setAway("u-1", { until: "2027-06-30" }, now)).rejects.toThrow("180 giorni");
  });
});

describe("getCategoryProfessionalCounts", () => {
  // Latina (41.47, 12.90), Roma (41.90, 12.50) a ~60 km, Milano lontanissima.
  const LATINA = { latitude: 41.4676, longitude: 12.9037 };
  const ROMA = { latitude: 41.9028, longitude: 12.4964 };
  function build(profiles: unknown[]) {
    const prisma = { professionalProfile: { findMany: vi.fn().mockResolvedValue(profiles) } };
    const service = new ProfessionalsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { prisma, service };
  }

  it("conta ogni professionista visibile una volta per categoria, i più scelti prima", async () => {
    const { prisma, service } = build([
      { ...LATINA, category: { slug: "idraulico" }, extraCategories: [{ slug: "elettricista" }] },
      { ...LATINA, category: { slug: "elettricista" }, extraCategories: [] },
      // Una categoria ripetuta tra principale e aggiuntive conta una volta.
      { ...ROMA, category: { slug: "fabbro" }, extraCategories: [{ slug: "fabbro" }, { slug: "elettricista" }] },
    ]);
    await expect(service.getCategoryProfessionalCounts()).resolves.toEqual({
      scope: "ALL",
      counts: [
        { slug: "elettricista", count: 3 },
        { slug: "idraulico", count: 1 },
        { slug: "fabbro", count: 1 },
      ],
    });
    // Stessi filtri della ricerca pubblica, senza demo.
    const where = prisma.professionalProfile.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ isDemo: false, deletedAt: null, suspendedAt: null, pausedAt: null });
  });

  it("con una città conta solo chi è nel raggio della ricerca, altrimenti tutta Italia", async () => {
    const profiles = [
      { ...LATINA, category: { slug: "idraulico" }, extraCategories: [] },
      { ...ROMA, category: { slug: "fabbro" }, extraCategories: [] },
      { ...ROMA, category: { slug: "fabbro" }, extraCategories: [] },
    ];
    await expect(build(profiles).service.getCategoryProfessionalCounts("Latina")).resolves.toEqual({
      scope: "CITY",
      counts: [{ slug: "idraulico", count: 1 }],
    });
    // Nessuno vicino a Milano: si torna a tutta Italia.
    await expect(build(profiles).service.getCategoryProfessionalCounts("Milano")).resolves.toMatchObject({ scope: "ALL" });
  });

  it("dal lancio non conta gli account di prova, prima sì", async () => {
    const previous = process.env.LAUNCH_DATE;
    try {
      process.env.LAUNCH_DATE = "2026-01-01";
      const after = build([]);
      await after.service.getCategoryProfessionalCounts();
      expect(after.prisma.professionalProfile.findMany.mock.calls[0]![0].where).toMatchObject({ user: { testAccountAt: null } });

      process.env.LAUNCH_DATE = "2099-01-01";
      const before = build([]);
      await before.service.getCategoryProfessionalCounts();
      expect(before.prisma.professionalProfile.findMany.mock.calls[0]![0].where.user).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.LAUNCH_DATE;
      else process.env.LAUNCH_DATE = previous;
    }
  });
});

describe("servicesFirstFor — prestazioni del mestiere cercato per prime", () => {
  const services = [
    { name: "Installazione punti luce", categorySlug: "elettricista" },
    { name: "Sturatura scarichi", categorySlug: null },
    { name: "Pulizia filtri addolcitore", categorySlug: "idraulico" },
    { name: "Certificazione impianto", categorySlug: null },
  ];
  it("cercando idraulico mette prima le sue, anche quelle salvate senza mestiere", () => {
    expect(servicesFirstFor(services, "idraulico", ["elettricista", "idraulico"]).map((s) => s.name)).toEqual([
      "Sturatura scarichi",
      "Pulizia filtri addolcitore",
      "Installazione punti luce",
      "Certificazione impianto",
    ]);
  });
  it("senza mestiere cercato o con un solo mestiere non cambia l'ordine", () => {
    expect(servicesFirstFor(services, undefined, ["elettricista", "idraulico"])).toBe(services);
    expect(servicesFirstFor(services, "idraulico", ["idraulico"])).toBe(services);
  });
});

describe("ricerca a pagine e puntini della mappa (docs/changelog/2026-11-16-pagine-da-20.md)", () => {
  type Pro = Record<string, unknown> & { id: string };
  const pro = (id: string, extra: Record<string, unknown> = {}): Pro => ({
    id,
    businessName: `Ditta ${id}`,
    categorySlug: "idraulico",
    categoryLabel: "Idraulico",
    categories: [],
    city: "Latina",
    latitude: 41.46,
    longitude: 12.9,
    imageUrl: null,
    rating: 4.5,
    reviewCount: 3,
    verified: true,
    remoteAvailable: false,
    spokenLanguages: ["Italiano"],
    hasLiabilityInsurance: false,
    stripeVerified: false,
    subTags: [],
    services: [],
    availabilityFrom: "2026-11-16",
    distanceKm: 2,
    ...extra,
  });
  const build = (byCity: Pro[], withoutCity: Pro[] = byCity, freeIds: string[] = []) => {
    const service = new ProfessionalsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const inner = service as unknown as {
      rankedSearch: (params: { city?: string }) => Promise<Pro[]>;
      buildAvailabilityPreviews: (ids: string[], options: { days?: number; completeDays?: number }) => Promise<Map<string, { days: unknown[] }>>;
    };
    const ranked = vi.spyOn(inner, "rankedSearch").mockImplementation(async (params) => (params.city ? byCity : withoutCity).map((item) => ({ ...item })));
    const free = { days: [{ date: "2026-11-16", times: [{ time: "15:00", endTime: "16:00", allowsHome: true, allowsOnline: false, homeAvailable: true, onlineAvailable: false }] }] };
    const previews = vi
      .spyOn(inner, "buildAvailabilityPreviews")
      .mockImplementation(async (ids) => new Map(ids.filter((id) => freeIds.includes(id)).map((id) => [id, free])));
    return { service, ranked, previews };
  };
  const now = new Date("2026-11-16T10:00:00Z");
  const many = Array.from({ length: 45 }, (_, index) => pro(`p${index + 1}`, { spokenLanguages: index % 2 ? ["Italiano", "Inglese"] : ["Italiano"] }));

  it("divide i trovati in pagine da 20 nell'ordine della ricerca, l'ultima con il resto", async () => {
    const { service, previews } = build(many);
    const first = await service.searchPage({ category: "idraulico", city: "Latina" }, { page: 1, pageSize: 20, filters: {}, now });
    expect(first.results.map((item) => item.id)).toEqual(many.slice(0, 20).map((item) => item.id));
    expect(first).toMatchObject({ total: 45, page: 1, pageCount: 3, languages: ["Inglese", "Italiano"], nearestOutsideKm: null });
    // L'agenda leggera solo per le 20 schede della pagina.
    expect(previews).toHaveBeenCalledWith(many.slice(0, 20).map((item) => item.id), { completeDays: 7 });
    const last = await service.searchPage({ category: "idraulico", city: "Latina" }, { page: 3, pageSize: 20, filters: {}, now });
    expect(last.results.map((item) => item.id)).toEqual(["p41", "p42", "p43", "p44", "p45"]);
    // "In breve" parla di tutti i trovati, non della pagina.
    expect(last.facts).toMatchObject({ count: 45, verified: 45, reviewCount: 135, cities: [{ city: "Latina", count: 45 }] });
  });

  it("una pagina che non esiste più diventa l'ultima", async () => {
    const { service } = build(many);
    const page = await service.searchPage({ category: "idraulico", city: "Latina" }, { page: 9, pageSize: 20, filters: {}, now });
    expect(page.page).toBe(3);
    expect(page.results).toHaveLength(5);
  });

  it("i filtri contano su tutti i trovati, non solo sulla pagina", async () => {
    const { service } = build(many, many, ["p2", "p4", "p30"]);
    const english = await service.searchPage({ category: "idraulico", city: "Latina" }, { page: 1, pageSize: 20, filters: { language: "Inglese" }, now });
    expect(english.total).toBe(22);
    const today = await service.searchPage({ category: "idraulico", city: "Latina" }, { page: 1, pageSize: 20, filters: { availability: "today" }, now });
    expect(today.results.map((item) => item.id)).toEqual(["p2", "p4", "p30"]);
    // Le lingue del pannello restano quelle di tutti i trovati.
    expect(english.languages).toEqual(["Inglese", "Italiano"]);
  });

  it("con l'inquadratura prima i trovati per luogo che ci stanno dentro, poi gli altri della zona", async () => {
    const inside = pro("dentro");
    const outside = pro("fuori", { latitude: 45.4, longitude: 9.19 });
    const nearby = pro("vicino", { latitude: 41.6, longitude: 12.7, city: "Aprilia" });
    const { service } = build([inside, outside], [outside, nearby, inside]);
    const page = await service.searchPage(
      { category: "idraulico", city: "Latina" },
      { page: 1, pageSize: 20, filters: {}, bounds: { north: 42, south: 41, east: 13.5, west: 12 }, now },
    );
    expect(page.results.map((item) => item.id)).toEqual(["dentro", "vicino"]);
  });

  it("nessuno nel raggio: dice la distanza del più vicino", async () => {
    const { service } = build([pro("lontano", { distanceKm: 37.6 })]);
    const page = await service.searchPage({ category: "idraulico", city: "Latina" }, { page: 1, pageSize: 20, filters: {}, now });
    expect(page.nearestOutsideKm).toBe(38);
  });

  it("i puntini sono tutti i trovati con i filtri, leggeri e senza chi non ha coordinate", async () => {
    const withService = pro("p1", { services: [{ id: "s1", name: "Sostituzione rubinetto" }], matchedServiceId: "s1" });
    const { service, previews } = build(many, [withService, pro("senza", { latitude: 0, longitude: 0 }), ...many.slice(1)]);
    const pins = await service.pins({ category: "idraulico" }, {}, now);
    expect(pins).toHaveLength(45);
    expect(pins[0]).toEqual({
      id: "p1",
      businessName: "Ditta p1",
      categorySlug: "idraulico",
      categoryLabel: "Idraulico",
      categories: [],
      city: "Latina",
      latitude: 41.46,
      longitude: 12.9,
      imageUrl: null,
      rating: 4.5,
      reviewCount: 3,
      verified: true,
      distanceKm: 2,
      matchedServiceName: "Sostituzione rubinetto",
    });
    // Senza filtri sull'agenda i puntini non la calcolano.
    expect(previews).not.toHaveBeenCalled();
  });
});

describe("agenda leggera calcolata solo per i giorni che servono", () => {
  const slot = (extra: Record<string, unknown>) => ({
    professionalProfileId: "p-1",
    dayOfWeek: 0,
    date: null,
    startTime: "23:00",
    endTime: "23:59",
    allowsHome: true,
    allowsOnline: false,
    homeMaxBookings: 1,
    onlineMaxBookings: 1,
    ...extra,
  });
  const run = async (slots: unknown[], options: { days?: number; completeDays?: number }) => {
    const prisma = {
      availabilitySlot: { findMany: vi.fn().mockResolvedValue(slots) },
      booking: { findMany: vi.fn().mockResolvedValue([]) },
      externalJob: { findMany: vi.fn().mockResolvedValue([]) },
      availabilityException: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ProfessionalsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const inner = service as unknown as { buildAvailabilityPreviews: (ids: string[], o: typeof options) => Promise<Map<string, { days: { date: string }[] }>> };
    return (await inner.buildAvailabilityPreviews(["p-1"], options)).get("p-1")?.days.map((day) => day.date) ?? [];
  };
  const addDays = (days: number) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  };
  const everyDay = Array.from({ length: 7 }, (_, dayOfWeek) => slot({ dayOfWeek }));

  it("con fasce libere ogni giorno si ferma alla prima settimana", async () => {
    const dates = await run(everyDay, { completeDays: 7 });
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((date) => date <= addDays(6).toISOString().slice(0, 10))).toBe(true);
  });

  it("più avanti tiene solo il primo giorno libero online", async () => {
    const online = slot({ date: addDays(20), allowsHome: false, allowsOnline: true, startTime: "10:00", endTime: "11:00" });
    const later = slot({ date: addDays(25), allowsHome: false, allowsOnline: true, startTime: "10:00", endTime: "11:00" });
    const dates = await run([...everyDay, online, later], { completeDays: 7 });
    expect(dates.filter((date) => date > addDays(6).toISOString().slice(0, 10))).toEqual([addDays(20).toISOString().slice(0, 10)]);
  });

  it("per i filtri bastano i prossimi giorni chiesti", async () => {
    const dates = await run(everyDay, { days: 3 });
    expect(dates.every((date) => date <= addDays(2).toISOString().slice(0, 10))).toBe(true);
  });
});
