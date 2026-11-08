import { describe, expect, it, vi } from "vitest";
import { dac7Quarter, fiscalResidenceAbroad, monthlyInvoiceLate, occasionalIncomeNotice, platformInvoiceNote, platformInvoiceSubtitle } from "@professionisti/shared";
import { InvoicesService } from "./invoices.service";

/** Collaudo dell'08/11/2026, gruppo 5 (fatture e fisco): E5-02, E5-04, E5-05, E5-06, E5-09. */

const fiscal = {
  entityType: "SOLE_PROPRIETOR",
  fiscalFirstName: "Mario",
  fiscalLastName: "Rossi",
  fiscalCodiceFiscale: "RSSMRA80A01H501U",
  businessName: "Idraulica Rossi",
  vatNumber: "IT12345678903",
  registeredStreet: "Via Roma",
  registeredHouseNumber: "1",
  registeredCity: "Roma",
  registeredPostalCode: "00100",
  registeredProvince: "RM",
  registeredCountry: "IT",
  taxResidenceCountry: "IT",
  sdiRecipientCode: "ABC1234",
  pecEmail: null,
  chargesVat: false,
};

const company = { companyName: "Professionisti S.r.l.", vatNumber: "01234567897", taxCode: null, street: "Via Milano", houseNumber: "2", postalCode: "20100", city: "Milano", province: "MI", country: "IT", taxRegime: "RF01", reaOffice: null, reaNumber: null, shareCapital: null, pecEmail: null, invoicesFrom: null };

type Pro = { id: string; isDemo?: boolean; test?: boolean; country?: string };

function build(pros: Pro[], entries: { id: string; professionalProfileId: string; grossEurCents: number; taxableEurCents: number }[], opts: { existing?: string[] } = {}) {
  const notify = vi.fn();
  const tx = {
    invoiceCounter: { upsert: vi.fn().mockResolvedValue({ last: 1 }) },
    invoice: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `inv-${data.professionalProfileId}`, ...data })) },
    platformFeeEntry: { updateMany: vi.fn().mockImplementation(({ where }) => Promise.resolve({ count: where.id.in.length })) },
  };
  const byId = new Map(pros.map((p) => [p.id, p]));
  const prisma = {
    platformInvoiceSettings: { findUnique: vi.fn().mockResolvedValue(company) },
    platformFeeEntry: {
      findMany: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          entries
            .filter((e) => !where.professionalProfileId?.notIn?.includes(e.professionalProfileId))
            .map((e) => ({ ...e, description: "Acconto online", paymentEurCents: 10000, jobPayment: null })),
        ),
      ),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    invoice: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(opts.existing?.includes(where.dedupeKey) ? { id: "old" } : null)),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountEurCents: null } }),
    },
    professionalProfile: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where?.OR) return Promise.resolve(pros.filter((p) => p.isDemo || p.test).map((p) => ({ id: p.id })));
        return Promise.resolve(pros.map((p) => ({ id: p.id, businessName: `Pro ${p.id}` })));
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const p = byId.get(where.id);
        return Promise.resolve(
          p
            ? { businessName: `Pro ${p.id}`, isDemo: !!p.isDemo, userId: `u-${p.id}`, user: { testAccountAt: p.test ? new Date() : null, deletedAt: null }, fiscalProfile: { ...fiscal, taxResidenceCountry: p.country ?? "IT", registeredCountry: p.country ?? "IT" } }
            : null,
        );
      }),
    },
    subscription: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "admin", adminRoles: ["SUPER"] }]) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new InvoicesService(prisma as never, { notify } as never);
  return { service, prisma, tx, notify };
}

describe("E5-05: gli account di prova non fanno fatture", () => {
  it("le trattenute di un account di prova o di esempio restano fuori dal giro del mese", async () => {
    const { service, tx, prisma } = build(
      [{ id: "vero" }, { id: "prova", test: true }, { id: "demo", isDemo: true }],
      [
        { id: "e1", professionalProfileId: "vero", grossEurCents: 854, taxableEurCents: 700 },
        { id: "e2", professionalProfileId: "prova", grossEurCents: 854, taxableEurCents: 700 },
        { id: "e3", professionalProfileId: "demo", grossEurCents: 854, taxableEurCents: 700 },
      ],
    );
    expect(await service.issueMonthlyFeeInvoices("2026-10")).toBe(1);
    expect(prisma.platformFeeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ professionalProfileId: { notIn: ["prova", "demo"] } }) }));
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
    expect(tx.invoice.create.mock.calls[0]?.[0].data.professionalProfileId).toBe("vero");
  });

  it("nessuna fattura dell'abbonamento a un account di prova", async () => {
    const { service, tx } = build([{ id: "prova", test: true }], []);
    const issued = await service.issueForStripeInvoice({ id: "in_1", amount_paid: 2318, metadata: { professionalProfileId: "prova" }, lines: { data: [] } } as never, () => null);
    expect(issued).toBe(false);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});

describe("E5-04: residenza fiscale all'estero", () => {
  it("niente fattura automatica, la Finanza viene avvisata", async () => {
    const { service, tx, notify } = build([{ id: "fr", country: "FR" }], [{ id: "e1", professionalProfileId: "fr", grossEurCents: 854, taxableEurCents: 700 }]);
    await service.runMonthly(new Date("2026-11-01T07:00:00+01:00"));
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("admin", "ADMIN_FEE_RECONCILIATION", expect.objectContaining({ kind: "abroad", month: "2026-10" }));
  });

  it("la regola guarda il paese di residenza e quello della sede", () => {
    expect(fiscalResidenceAbroad({ taxResidenceCountry: "IT", registeredCountry: "IT" })).toBe(false);
    expect(fiscalResidenceAbroad({ taxResidenceCountry: null, registeredCountry: null })).toBe(false);
    expect(fiscalResidenceAbroad({ taxResidenceCountry: "fr", registeredCountry: "IT" })).toBe(true);
    expect(fiscalResidenceAbroad({ taxResidenceCountry: "IT", registeredCountry: "CH" })).toBe(true);
  });
});

describe("E5-02: recupero del giro del 1°", () => {
  it("il 3 del mese emette la fattura mancata del mese prima, datata all'ultimo giorno", async () => {
    const { service, tx, notify } = build([{ id: "vero" }], [{ id: "e1", professionalProfileId: "vero", grossEurCents: 854, taxableEurCents: 700 }]);
    expect(await service.recoverMonthly(new Date("2026-11-03T07:30:00+01:00"))).toBe(1);
    expect(tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ periodMonth: "2026-10", dedupeKey: "JOB_FEES:vero:2026-10", issuedAt: new Date("2026-10-31T12:00:00Z") }) });
    // Il riepilogo del mese parte solo per chi riceve la fattura adesso.
    expect(notify).not.toHaveBeenCalledWith("u-altro", expect.anything(), expect.anything());
  });

  it("fattura del mese già emessa: i movimenti arrivati dopo restano per il mese successivo", async () => {
    const { service, tx } = build([{ id: "vero" }], [{ id: "e9", professionalProfileId: "vero", grossEurCents: 854, taxableEurCents: 700 }], { existing: ["JOB_FEES:vero:2026-10"] });
    expect(await service.recoverMonthly(new Date("2026-11-04T07:30:00+01:00"))).toBe(0);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it("il 10, con trattenute ancora senza fattura, avvisa la Finanza", async () => {
    const { service, prisma, notify } = build([{ id: "vero", country: "FR" }], []);
    prisma.platformFeeEntry.groupBy.mockResolvedValue([{ professionalProfileId: "vero", _count: { _all: 2 } }]);
    await service.recoverMonthly(new Date("2026-11-10T07:30:00+01:00"));
    expect(notify).toHaveBeenCalledWith("admin", "ADMIN_FEE_RECONCILIATION", expect.objectContaining({ kind: "unbilled", month: "2026-10" }));
  });

  it("dopo il 15 del mese dopo la fattura del mese è in ritardo", () => {
    expect(monthlyInvoiceLate("2026-10", new Date("2026-11-15T20:00:00Z"))).toBe(false);
    expect(monthlyInvoiceLate("2026-10", new Date("2026-11-16T08:00:00Z"))).toBe(true);
    expect(monthlyInvoiceLate("2026-12", new Date("2027-01-10T08:00:00Z"))).toBe(false);
    expect(monthlyInvoiceLate("2026-12", new Date("2027-01-20T08:00:00Z"))).toBe(true);
  });
});

describe("E5-06: nota di credito per il rimborso dell'abbonamento", () => {
  const original = {
    id: "abb-7",
    type: "MANOVIA_TO_PROFESSIONAL",
    source: "SUBSCRIPTION",
    creditNote: false,
    status: "ISSUED",
    professionalProfileId: "vero",
    series: "ABB",
    year: 2026,
    number: 7,
    amountEurCents: 2318,
    vatRateBasisPoints: 2200,
    stripeInvoiceId: "in_7",
    lines: [{ description: "Abbonamento Base mensile", detail: "dal 01/11/2026 al 01/12/2026", taxableEurCents: 1900 }],
  };

  it("rimborso intero: TD04 con le stesse righe, collegata alla fattura ABB", async () => {
    const { service, prisma, tx } = build([{ id: "vero" }], []);
    prisma.invoice.findFirst.mockResolvedValue(original);
    expect(await service.issueRefundCreditNote({ chargeId: "ch_1", paymentIntentId: "pi_1", stripeInvoiceId: "in_7", refundedEurCents: 2318 }, new Date("2026-11-05T10:00:00Z"))).toBe(true);
    expect(tx.invoiceCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { series_year: { series: "ABB", year: 2026 } } }));
    expect(tx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ creditNote: true, source: "SUBSCRIPTION", relatedInvoiceId: "abb-7", amountEurCents: 2318, taxableEurCents: 1900, vatEurCents: 418, dedupeKey: "REFUND:ch_1:2318" }),
    });
  });

  it("rimborso in due volte: la seconda nota solo per la parte nuova", async () => {
    const { service, prisma, tx } = build([{ id: "vero" }], []);
    prisma.invoice.findFirst.mockResolvedValue(original);
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { amountEurCents: 1000 } });
    await service.issueRefundCreditNote({ chargeId: "ch_1", paymentIntentId: "pi_1", stripeInvoiceId: "in_7", refundedEurCents: 2318 });
    expect(tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountEurCents: 1318, dedupeKey: "REFUND:ch_1:2318" }) });
    expect(tx.invoice.create.mock.calls[0]?.[0].data.lines[0].description).toMatch(/^Rimborso parziale/);
  });

  it("nessuna fattura per quel pagamento: nessuna nota", async () => {
    const { service, prisma, tx } = build([{ id: "vero" }], []);
    prisma.invoice.findFirst.mockResolvedValue(null);
    expect(await service.issueRefundCreditNote({ chargeId: "ch_2", paymentIntentId: "pi_2", stripeInvoiceId: null, refundedEurCents: 500 })).toBe(false);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it("testi della nota di credito dell'abbonamento", () => {
    const note = { source: "SUBSCRIPTION" as const, creditNote: true, vatRecoverable: null, periodMonth: null, issuedAt: "2026-11-05T12:00:00Z" };
    expect(platformInvoiceNote(note)).toContain("rimborsato");
    expect(platformInvoiceSubtitle(note)).toMatch(/^Rimborso: abbonamento, del 5 novembre/);
  });
});

describe("E5-09 e miglioria 5.000 €", () => {
  it("trimestre DAC7 all'ora di Roma", () => {
    // 1° aprile alle 00:30 a Roma = 31 marzo alle 22:30 UTC.
    expect(dac7Quarter(new Date("2026-03-31T22:30:00Z"))).toBe(2);
    expect(dac7Quarter(new Date("2026-03-31T21:30:00Z"))).toBe(1);
  });

  it("avviso ricevute dell'anno da 4.000 €", () => {
    expect(occasionalIncomeNotice(399_999)).toBeNull();
    expect(occasionalIncomeNotice(400_000)).toContain("si avvicinano a 5.000 €");
    expect(occasionalIncomeNotice(500_000)).toContain("superano 5.000 €");
  });
});
