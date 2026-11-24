import { describe, expect, it, vi } from "vitest";
import type { GuidedRequestInput } from "@professionisti/shared";
import { GuidedRequestsService } from "./guided-requests.service";

/**
 * Da 2 a 5 professionisti scelti dai risultati (docs/CHANGELOG.md §393):
 * una sola richiesta che arriva solo a loro, anche dove le richieste
 * generali sono chiuse.
 */
type Pro = { id: string; businessName: string; categoryId: string; pausedAt?: Date | null; deletedAt?: Date | null; remoteAvailable?: boolean };

function buildService(pros: Pro[]) {
  const rows = pros.map((pro) => ({
    userId: `user-${pro.id}`,
    deletedAt: null,
    suspendedAt: null,
    invitePendingAt: null,
    pausedAt: null,
    demotedUntil: null,
    requestsBlockedUntil: null,
    extraCategories: [],
    isDemo: true,
    fiscalProfile: null,
    // Le richieste di prova sono online: di serie i scelti lavorano online.
    remoteAvailable: true,
    ...pro,
  }));
  const prisma = {
    category: { findUnique: vi.fn().mockResolvedValue({ id: "cat-1", slug: "idraulico", label: "Idraulico" }) },
    professionalProfile: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(rows.filter((row) => where.id.in.includes(row.id))),
      ),
    },
    guidedRequest: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "gr-1", ...data })),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    lead: { createMany: vi.fn().mockResolvedValue({ count: pros.length }) },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const notifications = { notify: vi.fn(), emailRequestSent: vi.fn() };
  const metrics = { recordRequestReceived: vi.fn() };
  const timeline = { log: vi.fn() };
  const generalRequests = { availability: vi.fn().mockResolvedValue({ open: false, closedScope: "GLOBAL" }) };
  const service = new GuidedRequestsService(
    prisma as never,
    notifications as never,
    metrics as never,
    timeline as never,
    generalRequests as never,
  );
  return { service, prisma, notifications, timeline, generalRequests };
}

const ids = ["0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a61", "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a62", "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a63"];
const input = {
  categorySlug: "idraulico",
  description: "Perde il rubinetto della cucina",
  photoUrls: [],
  city: "Latina",
  serviceMode: "ONLINE",
  isUrgent: false,
  forwardIfNoReply: false,
  professionalProfileIds: ids.slice(0, 2),
} as unknown as Omit<GuidedRequestInput, "extraCategorySlugs">;

describe("GuidedRequestsService.create con i professionisti scelti", () => {
  it("arriva solo ai scelti, anche con le richieste generali chiuse", async () => {
    const { service, prisma, notifications, timeline, generalRequests } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1" },
      { id: ids[2]!, businessName: "Non scelto", categoryId: "cat-1" },
    ]);
    const result = await service.create("client-1", input);
    expect(result.matchedProfessionals).toBe(2);
    expect(generalRequests.availability).not.toHaveBeenCalled();
    expect(prisma.guidedRequest.create.mock.calls[0]![0].data).toMatchObject({
      chosenProfileIds: ids.slice(0, 2),
      professionalProfileId: undefined,
    });
    const leads = prisma.lead.createMany.mock.calls[0]![0].data as { professionalProfileId: string }[];
    expect(leads.map((lead) => lead.professionalProfileId).sort()).toEqual(ids.slice(0, 2).sort());
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(timeline.log).toHaveBeenCalledWith(
      "gr-1",
      ids[0],
      "CLIENT",
      "Il cliente ha scelto te e un altro professionista per questa richiesta di preventivo.",
    );
    expect(notifications.emailRequestSent).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        chosen: 2,
        direct: false,
        summary: expect.objectContaining({ businessName: "Idraulica Rossi e Bianchi Impianti" }),
      }),
    );
  });

  it("un professionista in pausa blocca l'invio con il suo nome", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1", pausedAt: new Date() },
    ]);
    await expect(service.create("client-1", input)).rejects.toThrow("Bianchi Impianti al momento non accetta nuove richieste");
    expect(prisma.guidedRequest.create).not.toHaveBeenCalled();
  });

  it("un professionista di un altro mestiere viene rifiutato", async () => {
    const { service } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Verdi Giardini", categoryId: "cat-2" },
    ]);
    await expect(service.create("client-1", input)).rejects.toThrow("Verdi Giardini non fa questo lavoro");
  });

  it("un professionista che non è più sul sito viene rifiutato", async () => {
    const { service } = buildService([{ id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" }]);
    await expect(service.create("client-1", input)).rejects.toThrow("non è più sul sito");
  });
});

/** La stessa richiesta mandata di nuovo entro pochi minuti (collaudo I-10). */
describe("GuidedRequestsService.create — doppio invio", () => {
  /** La richiesta già salvata, uguale a `input` (stesso posto e stesso momento). */
  const stored = { description: input.description, serviceMode: "ONLINE", address: null, houseNumber: null, preferredDate: null, preferredTimeSlot: null };

  it("rifiuta lo stesso testo per la stessa categoria entro 30 minuti, senza crearne un'altra", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1" },
    ]);
    prisma.guidedRequest.findMany.mockResolvedValue([{ ...stored, description: "perde il rubinetto  della cucina." }]);
    await expect(service.create("client-1", input)).rejects.toThrow("Hai già mandato questa richiesta pochi minuti fa");
    // Col codice il sito riconosce, dopo una rete caduta, che il primo invio era arrivato
    // (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md).
    await expect(service.create("client-1", input)).rejects.toMatchObject({ response: { code: "DUPLICATE_REQUEST" } });
    expect(prisma.guidedRequest.create).not.toHaveBeenCalled();
    expect(prisma.guidedRequest.findMany.mock.calls[0]![0].where).toMatchObject({ clientId: "client-1", deletedByClientAt: null, professionalProfileId: null });
  });

  it("un testo diverso parte", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1" },
    ]);
    prisma.guidedRequest.findMany.mockResolvedValue([{ ...stored, description: "Si è rotto lo scarico del bagno" }]);
    await expect(service.create("client-1", input)).resolves.toMatchObject({ matchedProfessionals: 2 });
  });

  it("\"Invia comunque\": il cliente la manda di nuovo apposta e parte", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1" },
    ]);
    prisma.guidedRequest.findMany.mockResolvedValue([{ ...stored }]);
    await expect(service.create("client-1", { ...input, sendAnyway: true })).resolves.toMatchObject({ matchedProfessionals: 2 });
    expect(prisma.guidedRequest.create).toHaveBeenCalled();
  });

  it("stesso testo ma indirizzo o modalità diversi: un altro lavoro, parte", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1" },
    ]);
    prisma.guidedRequest.findMany.mockResolvedValue([{ ...stored, serviceMode: "HOME", address: "Via Roma" }]);
    await expect(service.create("client-1", input)).resolves.toMatchObject({ matchedProfessionals: 2 });
  });
});

/** Scelti di due mestieri (docs/changelog/2026-11-17-scelti-due-mestieri.md): una richiesta per mestiere, ognuna ai suoi scelti. */
describe("scelti di due mestieri", () => {
  const categories = [
    { id: "cat-mur", slug: "muratore" },
    { id: "cat-fal", slug: "falegname" },
  ];
  type Grouping = { chosenByCategory: (ids: string[], c: typeof categories, s: string[]) => Promise<Map<string, string[]>> };

  it("divide i scelti per mestiere, anche per una categoria in più del profilo", async () => {
    const { service } = buildService([
      { id: ids[0]!, businessName: "Edilizia Rossi", categoryId: "cat-mur" },
      { id: ids[1]!, businessName: "Falegnameria Bianchi", categoryId: "cat-fal" },
      { id: ids[2]!, businessName: "Tutto Casa", categoryId: "cat-tut", extraCategories: [{ id: "cat-fal" }] } as never,
    ]);
    const groups = await (service as unknown as Grouping).chosenByCategory(ids, categories, ["muratore", "falegname"]);
    expect(groups.get("muratore")).toEqual([ids[0]]);
    expect(groups.get("falegname")).toEqual([ids[1], ids[2]]);
  });

  it("chi non fa nessuno dei mestieri: rifiutata con il suo nome", async () => {
    const { service } = buildService([
      { id: ids[0]!, businessName: "Edilizia Rossi", categoryId: "cat-mur" },
      { id: ids[1]!, businessName: "Idraulica Verdi", categoryId: "cat-idr" },
    ]);
    await expect((service as unknown as Grouping).chosenByCategory(ids.slice(0, 2), categories, ["muratore", "falegname"])).rejects.toThrow(
      "Idraulica Verdi non fa questo lavoro",
    );
  });

  it("un mestiere senza scelti: rifiutata", async () => {
    const { service } = buildService([
      { id: ids[0]!, businessName: "Edilizia Rossi", categoryId: "cat-mur" },
      { id: ids[1]!, businessName: "Edilizia Neri", categoryId: "cat-mur" },
    ]);
    await expect((service as unknown as Grouping).chosenByCategory(ids.slice(0, 2), categories, ["muratore", "falegname"])).rejects.toThrow(
      "almeno un professionista per ogni mestiere",
    );
  });
});

describe("GuidedRequestsService.create — scelti e Online", () => {
  it("una richiesta online si ferma se uno dei scelti non lavora online, e dice chi", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1", remoteAvailable: false },
    ]);
    await expect(service.create("client-1", { ...input, professionalProfileIds: [ids[0]!, ids[1]!] })).rejects.toThrow(
      'Bianchi Impianti non lavora online: toglilo dalla scelta o scegli "A domicilio".',
    );
    expect(prisma.guidedRequest.create).not.toHaveBeenCalled();
  });

  it("a domicilio parte anche per chi non lavora online", async () => {
    const { service, prisma } = buildService([
      { id: ids[0]!, businessName: "Idraulica Rossi", categoryId: "cat-1" },
      { id: ids[1]!, businessName: "Bianchi Impianti", categoryId: "cat-1", remoteAvailable: false },
    ]);
    await service.create("client-1", { ...input, serviceMode: "HOME", address: "Via Roma", houseNumber: "1", professionalProfileIds: [ids[0]!, ids[1]!] } as typeof input);
    expect(prisma.guidedRequest.create).toHaveBeenCalledTimes(1);
  });
});
