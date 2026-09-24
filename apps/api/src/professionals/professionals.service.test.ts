import { describe, expect, it, vi } from "vitest";
import { ProfessionalsService } from "./professionals.service";

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
    clientReview: { findMany: vi.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };
  const service = new ProfessionalsService(
    prisma as never,
    {} as never, // geocodingService — non usato da getMyLeads
    {} as never, // notificationsService
    {} as never, // guidedRequestsService
    {} as never, // professionalMetricsService
    {} as never, // timelineService
  );
  return { service, prisma };
}

const CLIENT_WITH_FULL_CONTACT_INFO = {
  id: "client-1",
  name: "Mario",
  surname: "Rossi",
  birthDate: new Date("1990-01-01"),
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
    // (richiesta esplicita dell'utente per la scheda cliente).
    expect(lead!.guidedRequest.clientName).toBe("Mario Rossi");
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
    expect(prisma.quote.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ professionalProfileId: { not: "pro-1" }, status: { not: "WITHDRAWN" } }) }),
    );
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
    const service = new ProfessionalsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
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
