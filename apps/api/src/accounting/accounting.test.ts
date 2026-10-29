import { describe, expect, it, vi } from "vitest";
import { freePeriodSummary, invoiceNumberLabel, statementCsv } from "@professionisti/shared";
import { lastDayOfMonth, previousMonth, romeDayIso, romeMonthOf, romeMonthRange } from "./accounting-dates";
import { buildFatturaPaXml, latin1, xmlAmount } from "./invoice-xml";
import { invoiceTotals, monthlyFeeInvoiceDraft, recipientComplete, recipientFromFiscal, sdiProgressive } from "./invoice-documents";
import { sdiOutcome } from "./sdi-provider";
import { InvoicesService } from "./invoices.service";

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
  sdiRecipientCode: "ABC1234",
  pecEmail: null,
  chargesVat: false,
};

describe("mesi contabili all'ora di Roma", () => {
  it("una trattenuta dopo la mezzanotte di Roma è del mese nuovo", () => {
    expect(romeMonthOf(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    expect(romeDayIso(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });

  it("inizio e fine del mese col cambio d'ora", () => {
    const { start, end } = romeMonthRange("2026-10");
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("mese prima e ultimo giorno", () => {
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
  });
});

describe("fattura delle trattenute del mese", () => {
  const hold = { description: "Acconto online", grossEurCents: 854, taxableEurCents: 700, paymentEurCents: 10000, jobLabel: "Lavoro del 12/10/2026" };
  const ret = { description: "Trattenuta restituita: rimborso al cliente", grossEurCents: -854, taxableEurCents: -700, paymentEurCents: 0, jobLabel: "Lavoro del 12/10/2026" };

  it("somma i movimenti, una riga per movimento", () => {
    const draft = monthlyFeeInvoiceDraft([hold, { ...hold, description: "Saldo online" }]);
    expect(draft).toMatchObject({ creditNote: false, grossEurCents: 1708, onlinePaidEurCents: 20000 });
    expect(draft?.lines).toHaveLength(2);
    expect(draft?.lines[0]).toMatchObject({ group: "Lavoro del 12/10/2026", taxableEurCents: 700 });
    expect(invoiceTotals(draft!.lines, draft!.grossEurCents)).toEqual({ taxableEurCents: 1400, vatEurCents: 308, roundingEurCents: 0 });
  });

  it("nessun documento se trattenuto e restituito si annullano", () => {
    expect(monthlyFeeInvoiceDraft([hold, ret])).toBeNull();
  });

  it("più restituito che trattenuto: nota di credito con le righe girate", () => {
    const draft = monthlyFeeInvoiceDraft([ret]);
    expect(draft).toMatchObject({ creditNote: true, grossEurCents: 854 });
    expect(draft?.lines[0]?.taxableEurCents).toBe(700);
  });

  it("il centesimo che non torna va nell'arrotondamento", () => {
    expect(invoiceTotals([{ description: "x", taxableEurCents: 1400 }], 1709)).toEqual({ taxableEurCents: 1400, vatEurCents: 308, roundingEurCents: 1 });
  });
});

describe("intestazione del professionista", () => {
  it("ditta individuale: nome e cognome, partita IVA senza IT, codice fiscale", () => {
    const r = recipientFromFiscal(fiscal, "Idraulica Rossi");
    expect(r).toMatchObject({ companyName: null, firstName: "Mario", vatNumber: "12345678903", taxCode: "RSSMRA80A01H501U", chargesVat: false, sdiRecipientCode: "ABC1234" });
    expect(recipientComplete(r)).toBe(true);
  });

  it("società: ragione sociale e partita IVA, niente codice fiscale", () => {
    const r = recipientFromFiscal({ ...fiscal, entityType: "BUSINESS" }, "x");
    expect(r).toMatchObject({ companyName: "Idraulica Rossi", firstName: null, taxCode: null, chargesVat: true });
  });

  it("privato: niente partita IVA né codice destinatario", () => {
    const r = recipientFromFiscal({ ...fiscal, entityType: "PRIVATE_INDIVIDUAL" }, "x");
    expect(r).toMatchObject({ vatNumber: null, sdiRecipientCode: null, taxCode: "RSSMRA80A01H501U", chargesVat: false });
  });

  it("senza indirizzo la fattura non è completa", () => {
    expect(recipientComplete(recipientFromFiscal({ ...fiscal, registeredStreet: null }, "x"))).toBe(false);
  });
});

describe("fattura elettronica", () => {
  const base = {
    progressive: sdiProgressive("COM", 2026, 17, 0),
    recipientCode: null,
    recipientPec: null,
    issuer: {
      companyName: "Professionisti S.r.l.",
      firstName: null,
      lastName: null,
      vatNumber: "01234567897",
      taxCode: "01234567897",
      address: { street: "Via Milano", houseNumber: "2", postalCode: "20100", city: "Milano", province: "MI", country: "IT" },
      taxRegime: "RF01",
      rea: { office: "MI", number: "123456", shareCapital: "10000.00" },
    },
    customer: { companyName: null, firstName: "Mario", lastName: "Rossi", vatNumber: "12345678903", taxCode: "RSSMRA80A01H501U", address: { street: "Via Roma", houseNumber: "1", postalCode: "00100", city: "Roma", province: "RM", country: "IT" } },
    documentType: "TD24" as const,
    date: "2026-10-31",
    number: invoiceNumberLabel("COM", 2026, 17),
    lines: [{ description: "Lavoro del 12/10/2026 - Acconto online", taxableEurCents: 1400 }],
    vatRateBasisPoints: 2200,
    taxableEurCents: 1400,
    vatEurCents: 308,
    roundingEurCents: 1,
    totalEurCents: 1709,
    paymentMethod: "MP22" as const,
    related: null,
    causale: ["Trattenute sui pagamenti online di ottobre 2026"],
  };

  it("ha i campi che lo SdI controlla", () => {
    const xml = buildFatturaPaXml(base);
    expect(base.progressive).toBe("C2600017");
    expect(xml).toContain('versione="FPR12"');
    expect(xml).toContain("<CodiceDestinatario>0000000</CodiceDestinatario>");
    expect(xml).toContain("<TipoDocumento>TD24</TipoDocumento>");
    expect(xml).toContain("<Numero>COM/2026/0017</Numero>");
    expect(xml).toContain("<ImportoTotaleDocumento>17.09</ImportoTotaleDocumento><Arrotondamento>0.01</Arrotondamento>");
    expect(xml).toContain("<ImponibileImporto>14.00</ImponibileImporto><Imposta>3.08</Imposta>");
    expect(xml).toContain("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678903</IdCodice></IdFiscaleIVA><CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale><Anagrafica><Nome>Mario</Nome><Cognome>Rossi</Cognome></Anagrafica>");
    expect(xml).toContain("<ModalitaPagamento>MP22</ModalitaPagamento>");
    expect(xml).toContain("<StatoLiquidazione>LN</StatoLiquidazione>");
  });

  it("nota di credito collegata alla fattura, PEC solo senza codice destinatario", () => {
    const xml = buildFatturaPaXml({ ...base, documentType: "TD04", recipientPec: "rossi@pec.it", related: { number: "COM/2026/0016", date: "2026-09-30" } });
    expect(xml).toContain("<PECDestinatario>rossi@pec.it</PECDestinatario>");
    expect(xml).toContain("<DatiFattureCollegate><IdDocumento>COM/2026/0016</IdDocumento><Data>2026-09-30</Data></DatiFattureCollegate>");
    expect(buildFatturaPaXml({ ...base, recipientCode: "ABC1234", recipientPec: "rossi@pec.it" })).not.toContain("PECDestinatario");
  });

  it("importi e testi nel formato giusto", () => {
    expect(xmlAmount(-140)).toBe("-1.40");
    expect(latin1("L’idraulico — «bravo» 🙂", 200)).toBe("L'idraulico - «bravo»");
    expect(buildFatturaPaXml({ ...base, lines: [{ description: "A & B <c>", taxableEurCents: 1400 }] })).toContain("<Descrizione>A &amp; B &lt;c&gt;</Descrizione>");
  });

  it("un nuovo invio dopo uno scarto ha un nome diverso", () => {
    expect(sdiProgressive("ABB", 2026, 3, 1)).toBe("A260000301");
    expect(sdiProgressive("ABB", 2026, 3, 1)).toHaveLength(10);
  });

  it("esiti dello SdI", () => {
    expect(sdiOutcome("RC")).toBe("DELIVERED");
    expect(sdiOutcome("MC")).toBe("DELIVERED");
    expect(sdiOutcome("NS")).toBe("REJECTED");
    expect(sdiOutcome("DT")).toBeNull();
  });
});

describe("estratto per il commercialista", () => {
  it("CSV col punto e virgola e i decimali con la virgola", () => {
    const csv = statementCsv([{ date: "2026-10-12", kind: "Trattenuta", job: "Idraulico; perdita", client: "Anna", amountEurCents: -854, taxableEurCents: -700, vatEurCents: -154, document: "Fattura COM/2026/0017" }]);
    expect(csv.startsWith("﻿Data;Movimento;")).toBe(true);
    expect(csv).toContain('2026-10-12;Trattenuta;"Idraulico; perdita";Anna;-8,54;-7,00;-1,54;Fattura COM/2026/0017');
  });
});

describe("mesi gratuiti a 0 €", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  it("il mese in corso su tre, con o senza carta", () => {
    for (const state of ["TRIAL", "ACTIVE"] as const) {
      const summary = freePeriodSummary({ state, trialEndsAt: "2027-01-29T10:00:00Z", freeMonths: { months: 3, currentMonth: 1 } }, now);
      expect(summary).toMatchObject({ label: "Mesi gratis", month: 1, months: 3, baseMonthEurCents: 1900 });
    }
  });

  it("offerta da un mese", () => {
    expect(freePeriodSummary({ state: "TRIAL", trialEndsAt: "2026-11-25T10:00:00Z", freeMonths: { months: 1, currentMonth: 1 } }, now)?.label).toBe("Mese gratis");
  });

  it("niente riepilogo fuori dai mesi gratis", () => {
    expect(freePeriodSummary({ state: "ACTIVE", trialEndsAt: "2026-11-01T10:00:00Z", freeMonths: { months: 3, currentMonth: null } }, now)).toBeNull();
    expect(freePeriodSummary({ state: "ACTIVE", trialEndsAt: "2026-11-25T10:00:00Z", freeMonths: null }, now)).toBeNull();
  });
});

describe("InvoicesService.issueMonthlyFeeInvoices", () => {
  function build(settings: Record<string, unknown> | null) {
    const tx = {
      invoiceCounter: { upsert: vi.fn().mockResolvedValue({ last: 17 }) },
      invoice: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv-1", ...data })) },
      platformFeeEntry: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      platformInvoiceSettings: { findUnique: vi.fn().mockResolvedValue(settings) },
      platformFeeEntry: {
        findMany: vi.fn().mockResolvedValue([
          { id: "e1", professionalProfileId: "pro-1", description: "Acconto online", grossEurCents: 854, taxableEurCents: 700, paymentEurCents: 10000, jobPayment: null },
          { id: "e2", professionalProfileId: "pro-1", description: "Saldo online", grossEurCents: 854, taxableEurCents: 700, paymentEurCents: 10000, jobPayment: null },
        ]),
      },
      invoice: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: "inv-1", series: "COM", year: 2026, number: 17, issuer: settings, recipient: null, lines: [], issuedAt: new Date(), createdAt: new Date() }),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ businessName: "Idraulica Rossi", fiscalProfile: fiscal }) },
      $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new InvoicesService(prisma as never, { notify: vi.fn() } as never);
    return { service, prisma, tx };
  }

  const company = { companyName: "Professionisti S.r.l.", vatNumber: "01234567897", taxCode: null, street: "Via Milano", houseNumber: "2", postalCode: "20100", city: "Milano", province: "MI", country: "IT", taxRegime: "RF01", reaOffice: null, reaNumber: null, shareCapital: null, pecEmail: null, invoicesFrom: null };

  it("senza i dati della nostra società nessuna fattura", async () => {
    const { service, prisma } = build(null);
    expect(await service.issueMonthlyFeeInvoices("2026-10")).toBe(0);
    expect(prisma.platformFeeEntry.findMany).not.toHaveBeenCalled();
  });

  it("una fattura differita al mese con il numero successivo della serie COM", async () => {
    const { service, tx } = build(company);
    expect(await service.issueMonthlyFeeInvoices("2026-10")).toBe(1);
    expect(tx.invoiceCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { series_year: { series: "COM", year: 2026 } } }));
    expect(tx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: "JOB_FEES",
        creditNote: false,
        series: "COM",
        number: 17,
        periodMonth: "2026-10",
        amountEurCents: 1708,
        taxableEurCents: 1400,
        vatEurCents: 308,
        roundingEurCents: 0,
        dedupeKey: "JOB_FEES:pro-1:2026-10",
        issuedAt: new Date("2026-10-31T12:00:00Z"),
      }),
    });
    expect(tx.platformFeeEntry.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["e1", "e2"] }, invoiceId: null }, data: { invoiceId: "inv-1" } });
  });
});
