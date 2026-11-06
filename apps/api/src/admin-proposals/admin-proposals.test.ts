import { describe, expect, it, vi } from "vitest";
import type { ServiceNamesAdminOverview } from "@professionisti/shared";
import {
  dictionaryWordCandidates,
  serviceWordCandidates,
  groupKey,
  mergeCandidates,
  missingExamplePhrases,
  silentProfessionals,
  standardServiceCandidates,
  testAccountsProposalDue,
  wordStem,
} from "./admin-proposals";
import { AdminProposalsService } from "./admin-proposals.service";

/** Proposte da approvare in Admin (docs/changelog/2026-11-03-automazioni-admin.md). */

describe("frase d'esempio", () => {
  it("propone una frase solo per i mestieri che non ne hanno, prima i più cercati", () => {
    const current = [
      { text: "Il rubinetto perde", categorySlug: "idraulico" },
      { text: "Salta la corrente", categorySlug: "elettricista" },
    ];
    const list = missingExamplePhrases(current, [
      { slug: "babysitter", count: 2 },
      { slug: "dogsitter", count: 9 },
    ]);
    expect(list.map((p) => p.categorySlug)).not.toContain("idraulico");
    expect(list[0]).toEqual({ categorySlug: "dogsitter", text: "Passeggiate per il cane", searches: 9 });
    expect(list[1]).toMatchObject({ categorySlug: "babysitter", text: "Babysitter per la sera" });
    expect(list.find((p) => p.categorySlug === "tuttofare")?.text).toBe("Montare una mensola");
  });
});

describe("parola per il dizionario", () => {
  const ia = (text: string, slug = "muratore") => ({ text, categories: [slug], source: "ia", outOfService: null });

  it("propone la parola che l'IA ha capito 10 volte allo stesso modo, con la radice", () => {
    const places = ["intonaco", "del soffitto", "forte", "in sala", "esterno", "in cucina", "della scala", "in bagno", "sul balcone", "in garage"];
    const rows = places.map((place) => ia(`scrostamento ${place}`));
    const list = dictionaryWordCandidates(rows, []);
    expect(list.map((w) => w.example)).toContain("scrostamento");
    expect(list.find((w) => w.example === "scrostamento")).toMatchObject({ stem: "scrostament", categorySlug: "muratore", aiAnswers: 10 });
  });

  it("niente con 9 risposte, con meno di 9 su 10 uguali, se già insegnata o se generica", () => {
    const nine = Array.from({ length: 9 }, () => ia("scrostamento"));
    expect(dictionaryWordCandidates(nine, [])).toEqual([]);
    const mixed = [...Array.from({ length: 10 }, () => ia("scrostamento")), ...Array.from({ length: 2 }, () => ia("scrostamento", "imbianchino"))];
    expect(dictionaryWordCandidates(mixed, [])).toEqual([]);
    expect(dictionaryWordCandidates(Array.from({ length: 12 }, () => ia("scrostamento")), ["scrost"])).toEqual([]);
    expect(dictionaryWordCandidates(Array.from({ length: 12 }, () => ia("bagno")), [])).toEqual([]);
  });

  it("mai numeri o parole che il dizionario conosce già", () => {
    expect(dictionaryWordCandidates(Array.from({ length: 12 }, () => ia("3331234567", "idraulico")), [])).toEqual([]);
    expect(dictionaryWordCandidates(Array.from({ length: 12 }, () => ia("rubinetto", "idraulico")), [])).toEqual([]);
  });

  it("singolare e plurale insieme", () => {
    expect(wordStem("infiltrazione")).toBe("infiltrazion");
    expect(wordStem("infiltrazioni")).toBe("infiltrazion");
  });
});

const overview = (handwritten: { name: string; professionalCount: number }[], standard: string[] = ["Manutenzione caldaia"]): ServiceNamesAdminOverview => ({
  minProfessionals: 3,
  suggested: [],
  aliases: [],
  categories: [
    {
      slug: "climatizzazione",
      label: "Climatizzazione",
      standard: standard.map((name) => ({ name, id: null, professionalCount: 0 })),
      handwritten: handwritten.map((h) => ({ ...h, variants: [h.name] })),
    },
  ],
});

describe("prestazioni", () => {
  it("da suggerire: scritta da almeno 3, mai se quasi uguale a una standard", () => {
    const list = standardServiceCandidates(overview([
      { name: "Bonifica impianto", professionalCount: 3 },
      { name: "Lavaggio split", professionalCount: 2 },
      { name: "Manutenzone caldaia", professionalCount: 4 },
    ]));
    expect(list).toEqual([{ categorySlug: "climatizzazione", name: "Bonifica impianto", professionals: 3 }]);
  });

  it("da unire: alla standard quasi uguale, o al nome scritto da più professionisti", () => {
    const list = mergeCandidates(overview([
      { name: "Manutenzone caldaia", professionalCount: 4 },
      { name: "Split lavaggio", professionalCount: 2 },
      { name: "Lavaggio split", professionalCount: 1 },
    ]));
    expect(list).toEqual([
      { categorySlug: "climatizzazione", name: "Manutenzone caldaia", canonical: "Manutenzione caldaia", professionals: 4, byWords: false },
      { categorySlug: "climatizzazione", name: "Lavaggio split", canonical: "Split lavaggio", professionals: 1, byWords: false },
    ]);
  });

  it("stesso lavoro con altre parole: da unire solo con almeno 3 professionisti, e non da aggiungere", () => {
    const standard = ["Manutenzione caldaia", "Sostituzione termostato"];
    const list = mergeCandidates(overview([
      { name: "Cambio cronotermostato", professionalCount: 3 },
      { name: "Montaggio termostato wifi", professionalCount: 2 },
      { name: "Posa pavimenti", professionalCount: 5 },
    ], standard));
    expect(list).toEqual([{ categorySlug: "climatizzazione", name: "Cambio cronotermostato", canonical: "Sostituzione termostato", professionals: 3, byWords: true }]);
    const added = standardServiceCandidates(overview([{ name: "Cambio cronotermostato", professionalCount: 3 }, { name: "Posa pavimenti", professionalCount: 5 }], standard));
    expect(added.map((s) => s.name)).toEqual(["Posa pavimenti"]);
  });
});

describe("consiglio di mettersi in pausa", () => {
  const lead = (pro: string, req: string, status = "PENDING", hidden = false) => ({ professionalProfileId: pro, guidedRequestId: req, status, hidden });

  it("solo chi ha almeno 3 richieste e non ne ha toccata nessuna", () => {
    const leads = [
      lead("a", "1"), lead("a", "2"), lead("a", "3"),
      lead("b", "1"), lead("b", "2"), lead("b", "3", "DECLINED"),
      lead("c", "1"), lead("c", "2"), lead("c", "3"),
      lead("d", "1"), lead("d", "2"),
      lead("e", "1"), lead("e", "2"), lead("e", "3", "PENDING", true),
    ];
    const silent = silentProfessionals(leads, new Set(["2|c"]));
    expect([...silent.entries()]).toEqual([["a", 3]]);
  });
});

describe("account di prova", () => {
  it("si propone di eliminarli solo da una settimana prima del lancio", () => {
    const launch = new Date("2026-12-01T00:00:00Z");
    expect(testAccountsProposalDue(new Date("2026-11-20T00:00:00Z"), launch)).toBe(false);
    expect(testAccountsProposalDue(new Date("2026-11-24T00:00:00Z"), launch)).toBe(true);
    expect(testAccountsProposalDue(new Date("2026-11-24T00:00:00Z"), null)).toBe(false);
  });

  it("la stessa lista di persone dà la stessa chiave, in qualsiasi ordine", () => {
    expect(groupKey(["b", "a"])).toBe(groupKey(["a", "b"]));
    expect(groupKey(["a", "c"])).not.toBe(groupKey(["a", "b"]));
  });
});

describe("decisioni", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  const row = {
    id: "p1",
    key: "EXAMPLE_PHRASE:dogsitter",
    kind: "EXAMPLE_PHRASE",
    status: "PENDING",
    snoozedUntil: null,
    updatedAt: now,
    payload: { title: "Frase d'esempio per Dogsitter", why: "", preview: { type: "lines", lines: [] }, data: { text: "Passeggiate per il cane" } },
  };

  function setup(roles: string[], examples: { text: string; categorySlug: string | null }[] = []) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ adminRoles: roles }) },
      adminProposal: {
        findUnique: vi.fn().mockResolvedValue(row),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
    };
    const audit = { record: vi.fn() };
    const examplesService = { adminList: vi.fn().mockResolvedValue({ custom: true, examples }), add: vi.fn() };
    const categories = { getPopularity: vi.fn().mockResolvedValue({ scope: "ALL", counts: [] }) };
    const service = new AdminProposalsService(prisma as never, audit as never, {} as never, categories as never, {} as never, examplesService as never, {} as never, {} as never, {} as never);
    return { prisma, audit, examplesService, service };
  }

  it("Approva chiama lo stesso servizio del pulsante a mano e lo scrive nel registro", async () => {
    const { prisma, audit, examplesService, service } = setup(["MODERATOR"]);
    const result = await service.decide("admin-1", "p1", "approve", now);
    expect(examplesService.add).toHaveBeenCalledWith("admin-1", "Passeggiate per il cane");
    expect(result.status).toBe("APPROVED");
    expect(prisma.adminProposal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", decidedById: "admin-1" }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: "AdminProposal", newValue: "APPROVED", reason: expect.stringContaining("Proposta approvata") }));
  });

  it("senza il permesso dell'area non si decide", async () => {
    const { examplesService, service } = setup(["FINANCE"]);
    await expect(service.decide("admin-1", "p1", "approve", now)).rejects.toThrow("permesso");
    expect(examplesService.add).not.toHaveBeenCalled();
  });

  it("se non vale più (frase già aggiunta a mano) non esegue niente", async () => {
    const { prisma, examplesService, service } = setup(["SUPER"], [{ text: "Passeggiate per il cane", categorySlug: "dogsitter" }]);
    await expect(service.decide("admin-1", "p1", "approve", now)).rejects.toThrow("Non serve più");
    expect(examplesService.add).not.toHaveBeenCalled();
    expect(prisma.adminProposal.delete).toHaveBeenCalled();
  });

  it("Riproponi toglie il No mai e la rimette in attesa se vale ancora", async () => {
    const { prisma, audit, service } = setup(["MODERATOR"]);
    prisma.adminProposal.findUnique.mockResolvedValue({ ...row, status: "REJECTED" });
    const result = await service.restore("admin-1", "p1", now);
    expect(prisma.adminProposal.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", status: "REJECTED" } });
    expect(prisma.adminProposal.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ key: "EXAMPLE_PHRASE:dogsitter" }) }));
    expect(result).toEqual({ back: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ newValue: "RESTORED", reason: expect.stringContaining("riproposta") }));
  });

  it("Riproponi: se non serve più lo dice, e senza permesso non si tocca", async () => {
    const done = setup(["SUPER"], [{ text: "Passeggiate per il cane", categorySlug: "dogsitter" }]);
    done.prisma.adminProposal.findUnique.mockResolvedValue({ ...row, status: "REJECTED" });
    expect(await done.service.restore("admin-1", "p1", now)).toEqual({ back: false });
    const finance = setup(["FINANCE"]);
    finance.prisma.adminProposal.findUnique.mockResolvedValue({ ...row, status: "REJECTED" });
    await expect(finance.service.restore("admin-1", "p1", now)).rejects.toThrow("permesso");
    expect(finance.prisma.adminProposal.deleteMany).not.toHaveBeenCalled();
  });

  it("di notte un'email rimandata con Non ora resta fino alla scadenza", async () => {
    const { prisma, service } = setup(["SUPER"]);
    const later = new Date("2026-11-10T10:00:00Z");
    prisma.adminProposal.findMany.mockImplementation(({ where }: { where: { status?: unknown } }) =>
      Promise.resolve(
        where.status && typeof where.status === "object" && "in" in (where.status as object)
          ? [
              { id: "email-rimandata", status: "SNOOZED", snoozedUntil: later, payload: { people: ["pro-1"] } },
              { id: "email-scaduta", status: "SNOOZED", snoozedUntil: now, payload: { people: ["pro-2"] } },
              { id: "frase-vecchia", status: "PENDING", snoozedUntil: null, payload: {} },
            ]
          : [],
      ),
    );
    await (service as unknown as { dropStale: (c: unknown[], n: Date) => Promise<void> }).dropStale([], now);
    expect(prisma.adminProposal.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["email-scaduta", "frase-vecchia"] } } });
  });

  it("Non ora la rimanda di 14 giorni, No mai la ferma", async () => {
    const { prisma, service } = setup(["SUPER"]);
    await service.decide("admin-1", "p1", "snooze", now);
    expect(prisma.adminProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SNOOZED", snoozedUntil: new Date("2026-11-17T10:00:00Z") }) }),
    );
    await service.decide("admin-1", "p1", "never", now);
    expect(prisma.adminProposal.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", snoozedUntil: null }) }));
  });
});

// docs/changelog/2026-11-06-dizionario-prestazioni.md
describe("serviceWordCandidates", () => {
  const iaService = (text: string, slug: string, service: string) => ({ text, categories: [slug], source: "ia", outOfService: null, service });

  it("propone di legare a una prestazione una parola che il dizionario porta già al mestiere", () => {
    const rows = Array.from({ length: 10 }, (_, i) => iaService(`il tubo gorgoglia ${i}`, "idraulico", "Sturatura scarichi"));
    expect(serviceWordCandidates(rows, [])).toEqual([
      expect.objectContaining({ example: "gorgoglia", categorySlug: "idraulico", service: "Sturatura scarichi", aiAnswers: 10 }),
    ]);
  });

  it("niente con 9 risposte, con prestazioni diverse, se già insegnata o se il dizionario la sa già", () => {
    const nine = Array.from({ length: 9 }, () => iaService("il tubo gorgoglia", "idraulico", "Sturatura scarichi"));
    expect(serviceWordCandidates(nine, [])).toEqual([]);
    const mixed = [...nine, iaService("il tubo gorgoglia", "idraulico", "Sostituzione sifone"), iaService("il tubo gorgoglia", "idraulico", "Sostituzione sifone")];
    expect(serviceWordCandidates(mixed, []).find((w) => w.example === "gorgoglia")).toBeUndefined();
    const ten = Array.from({ length: 10 }, () => iaService("il tubo gorgoglia", "idraulico", "Sturatura scarichi"));
    expect(serviceWordCandidates(ten, [{ word: "gorgogli", serviceName: "Sturatura scarichi" }]).find((w) => w.example === "gorgoglia")).toBeUndefined();
    const known = Array.from({ length: 10 }, () => iaService("scarico intasato", "idraulico", "Sturatura scarichi"));
    expect(serviceWordCandidates(known, []).find((w) => w.example === "intasato")).toBeUndefined();
  });

  it("le parole nuove portano anche la prestazione, se l'IA ha dato sempre la stessa", () => {
    const places = ["intonaco", "del soffitto", "forte", "in sala", "esterno", "in cucina", "della scala", "in bagno", "sul balcone", "in garage"];
    const rows = places.map((place) => ({ ...iaService(`scrostamento ${place}`, "muratore", "Riparazione crepe nei muri") }));
    expect(dictionaryWordCandidates(rows, []).find((w) => w.example === "scrostamento")).toMatchObject({ service: "Riparazione crepe nei muri" });
  });
});
