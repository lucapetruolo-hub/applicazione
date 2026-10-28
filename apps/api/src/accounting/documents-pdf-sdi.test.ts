import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { courtesyAmountChanged, courtesyDocumentLabel, courtesyTotalEurCents, courtesyYearCsv, courtesyYearTotals, type CourtesyDocumentSummary, type CourtesyYearSummary, type MonthlyStatement } from "@professionisti/shared";
import { courtesyDocumentSummary } from "./courtesy-documents";
import { pdfText, renderDocumentPdf } from "./document-pdf";
import { courtesyPdfModel, courtesyYearPdfModel, dac7PdfModel, invoicePdfModel, pdfFileName, statementPdfModel } from "./document-pdf-models";
import { sandboxTestInvoiceXml, sdiCompanyOf, type IssuerSnapshot } from "./invoice-documents";
import { OpenapiSdiProvider, sdiOutcomeFromNotifications, sdiRejectionMessage } from "./sdi-provider";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { StatementsService, accountantStatementEmail } from "./statements.service";
import { renderEmail } from "../email/email-layout";
import { notificationEmail } from "../email/templates/notification-emails";

// PDF, numero della copia di cortesia e invio allo SdI (docs/CHANGELOG.md §379);
// elenco dei documenti ai clienti in Admin (§380); riepilogo dell'anno (§382),
// che a gennaio va anche al commercialista (§390); avviso di dicembre (§391).

const issuer: IssuerSnapshot = {
  companyName: "Professionisti S.r.l.",
  vatNumber: "12345678903",
  taxCode: null,
  street: "Via Milano",
  houseNumber: "2",
  postalCode: "20100",
  city: "Milano",
  province: "MI",
  country: "IT",
  taxRegime: "RF01",
  reaOffice: null,
  reaNumber: null,
  shareCapital: null,
  pecEmail: "societa@pec.it",
};

const party = { name: "Mario Rossi", lines: ["Via Roma 1, 00100 Roma (RM)"] };

describe("PDF dei documenti", () => {
  it("i caratteri che il PDF non sa scrivere si sostituiscono", () => {
    expect(pdfText("−12,00 € → fine")).toBe("-12,00 € -> fine");
    expect(pdfText("Perché è così… «sì»")).toBe("Perché è così… «sì»");
    expect(pdfText("Città ✓ ok")).toBe("Città  ok");
  });

  it("nome del file senza barre né spazi", () => {
    expect(pdfFileName("fattura-COM/2026/0017")).toBe("fattura-COM-2026-0017.pdf");
    expect(pdfFileName("ricevuta-4/2026")).toBe("ricevuta-4-2026.pdf");
  });

  it("fattura, estratto, copia di cortesia e DAC7 diventano PDF", async () => {
    const invoice = invoicePdfModel({
      id: "i",
      number: "COM/2026/0017",
      source: "JOB_FEES",
      creditNote: false,
      periodMonth: "2026-09",
      issuedAt: "2026-09-30T10:00:00Z",
      totalEurCents: 854,
      sdiStatus: "SENT",
      issuer: party,
      recipient: { name: "Idraulica Rossi", lines: ["Codice destinatario ABC1234"] },
      lines: [{ description: "Trattenuta sull'acconto", detail: null, group: "Idraulico, perdita", taxableEurCents: 700 }],
      taxableEurCents: 700,
      vatEurCents: 154,
      roundingEurCents: 0,
      vatRatePercent: 22,
      relatedNumber: null,
      vatRecoverable: true,
      onlinePaidEurCents: 10000,
    } as never);
    expect(invoice.title).toBe("Fattura n. COM/2026/0017");
    expect(JSON.stringify(invoice.blocks)).toContain("L'IVA la recuperi nella tua dichiarazione IVA.");

    const statement = statementPdfModel(
      {
        month: "2026-09",
        monthLabel: "settembre 2026",
        totals: { onlineEurCents: 10000, directEurCents: 0, feesEurCents: 854, payoutsArrivedEurCents: 0 },
        rows: [{ jobPaymentId: "j", date: "2026-09-12T10:00:00Z", job: "Idraulico, perdita", client: "Anna", onlineEurCents: 10000, directEurCents: 0, feesEurCents: 854, payoutEurCents: null, payoutNote: "In attesa della conferma del cliente" }],
        blockedEurCents: 9146,
        feeInvoice: null,
        documentHint: "Per ogni pagamento ricordati di fare la fattura al cliente.",
      },
      "Idraulica Rossi",
    );
    expect(statement.subtitle).toContain("Idraulica Rossi");

    const receipt = courtesyPdfModel({ kind: "RECEIPT", issuer: party, customer: party, date: "2026-10-20T10:00:00Z", description: "Pulizie", totalEurCents: 18000, vat: null, paidHow: null, notes: [], invoiceRequested: false, number: "4/2026" });
    expect(JSON.stringify(receipt.blocks)).toContain("4/2026");
    expect(receipt.blocks.some((b) => b.type === "signature")).toBe(true);

    const dac7 = dac7PdfModel({ year: 2026, quarters: [{ quarter: 3, directEurCents: 1000, onlineEurCents: 0, feesEurCents: 0, jobs: 1 }], totalEurCents: 1000, submittedAt: null, notifiedAt: null }, null, "Mario Rossi", new Date("2026-10-27T10:00:00Z"));
    expect(JSON.stringify(dac7.blocks)).toContain("Anno in corso");

    for (const model of [invoice, statement, receipt, dac7]) {
      const pdf = await renderDocumentPdf(model);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
    }
  });
});

describe("numero della copia di cortesia", () => {
  function build(kind: "PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR", saved: Record<string, unknown> | null, lastNumber: number | null) {
    const prisma = {
      booking: {
        findUnique: vi.fn().mockResolvedValue({
          id: "b1",
          professionalProfileId: "pro-1",
          status: "COMPLETED",
          professionalCompletedAt: new Date("2026-10-20T10:00:00Z"),
          scheduledAt: new Date("2026-10-19T10:00:00Z"),
          street: "Via Roma",
          houseNumber: "1",
          postalCode: "00100",
          city: "Roma",
          province: "RM",
          client: { name: "Anna", surname: "Bianchi" },
          jobPayment: null,
          professionalProfile: { businessName: "Mario", fiscalProfile: { entityType: kind, fiscalFirstName: "Mario", fiscalLastName: "Rossi", chargesVat: false } },
          quote: null,
        }),
      },
      courtesyDocument: {
        findUnique: vi.fn().mockResolvedValue(saved),
        aggregate: vi.fn().mockResolvedValue({ _max: { number: lastNumber } }),
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const invoices = { profileIdOf: vi.fn().mockResolvedValue("pro-1") };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    return { service: new CourtesyCopyService(prisma as never, invoices as never, audit as never, {} as never), prisma, audit };
  }

  it("la prima ricevuta dell'anno prende il numero 1, la successiva il 4 dopo il 3", async () => {
    const first = build("PRIVATE_INDIVIDUAL", null, null);
    expect((await first.service.forProfessional("u1", "b1")).number).toBe("1/2026");
    const next = build("PRIVATE_INDIVIDUAL", null, 3);
    expect((await next.service.forProfessional("u1", "b1")).number).toBe("4/2026");
    expect(next.prisma.courtesyDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ kind: "RECEIPT", year: 2026, number: 4 }) }));
  });

  it("riaprendo la stessa ricevuta il numero resta lo stesso", async () => {
    const { service, prisma } = build("PRIVATE_INDIVIDUAL", { number: 2, year: 2026, ownNumber: null }, 9);
    expect((await service.forProfessional("u1", "b1")).number).toBe("2/2026");
    expect(prisma.courtesyDocument.upsert).not.toHaveBeenCalled();
  });

  it("due copie aperte insieme: chi perde il numero prende il successivo", async () => {
    const { service, prisma } = build("PRIVATE_INDIVIDUAL", null, 3);
    prisma.courtesyDocument.aggregate.mockResolvedValueOnce({ _max: { number: 3 } }).mockResolvedValueOnce({ _max: { number: 4 } });
    prisma.courtesyDocument.upsert.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    expect((await service.forProfessional("u1", "b1")).number).toBe("5/2026");
  });

  it("per la fattura il numero è quello del professionista, e si salva", async () => {
    const { service, prisma } = build("SOLE_PROPRIETOR", null, null);
    expect((await service.forProfessional("u1", "b1")).number).toBeNull();
    expect(prisma.courtesyDocument.aggregate).not.toHaveBeenCalled();
    expect((await service.setOwnNumber("u1", "b1", { number: " 12/A " })).number).toBe("12/A");
    expect(prisma.courtesyDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ kind: "INVOICE", ownNumber: "12/A" }) }));
  });

  it("scaricando il PDF ci segniamo quando e con che importo", async () => {
    const { service, prisma } = build("SOLE_PROPRIETOR", { number: null, year: 2026, ownNumber: "7" }, null);
    await service.forProfessionalPdf("u1", "b1");
    expect(prisma.courtesyDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kind: "INVOICE", year: 2026, ownNumber: "7", pdfTotalEurCents: null, pdfDownloadedAt: expect.any(Date) }),
        update: { pdfDownloadedAt: expect.any(Date), pdfTotalEurCents: null },
      }),
    );
  });

  it("l'admin vede solo i documenti preparati, non dà numeri nuovi e resta nel registro", async () => {
    const missing = build("PRIVATE_INDIVIDUAL", null, 3);
    await expect(missing.service.forAdmin("b1", "admin-1")).rejects.toThrow("Documento non trovato.");
    expect(missing.prisma.courtesyDocument.upsert).not.toHaveBeenCalled();

    const { service, prisma, audit } = build("PRIVATE_INDIVIDUAL", { id: "d1", number: 2, year: 2026, ownNumber: null }, 9);
    expect((await service.forAdmin("b1", "admin-1")).number).toBe("2/2026");
    expect(prisma.courtesyDocument.upsert).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: "CourtesyDocument", entityId: "b1", fieldName: "read", changedByUserId: "admin-1" }));
  });

  it("ricerca per numero della ricevuta, numero della fattura o nome", async () => {
    const { service, prisma } = build("PRIVATE_INDIVIDUAL", null, null);
    await service.adminList({ q: "4/2026" });
    const where = prisma.courtesyDocument.findMany.mock.calls[0]![0].where;
    expect(where.OR).toContainEqual({ kind: "RECEIPT", number: 4, year: 2026 });
    expect(where.OR).toContainEqual({ ownNumber: { contains: "4/2026", mode: "insensitive" } });
    await service.adminList({ q: "Rossi", kind: "INVOICE", year: 2026 });
    const second = prisma.courtesyDocument.findMany.mock.calls[1]![0].where;
    expect(second).toMatchObject({ kind: "INVOICE", year: 2026 });
    expect(second.OR).not.toContainEqual(expect.objectContaining({ number: expect.anything() }));
  });

  it("sulla copia c'è l'importo dell'ultimo PDF, e si scrive \"Pagato online\" senza dire con cosa", async () => {
    const { service, prisma } = build("PRIVATE_INDIVIDUAL", { number: 2, year: 2026, ownNumber: null, pdfTotalEurCents: 12000 }, null);
    prisma.booking.findUnique.mockResolvedValueOnce({
      ...(await prisma.booking.findUnique()),
      jobPayment: { paymentMethod: "MANOVIA", paidEurCents: 12000, refundedEurCents: 2000, grossAmountEurCents: 12000, balancePaidAt: null, directReportedAt: null },
    });
    const copy = await service.forProfessional("u1", "b1");
    expect(copy).toMatchObject({ totalEurCents: 10000, pdfTotalEurCents: 12000, paidHow: "Pagato online" });
    expect(courtesyAmountChanged(copy.pdfTotalEurCents ?? null, copy.totalEurCents)).toBe(true);
  });

  it("documenti del professionista: importo cambiato dopo il PDF e totali dell'anno", () => {
    const booking = (refunded: number) => ({
      jobPayment: { paymentMethod: "MANOVIA", paidEurCents: 12000, refundedEurCents: refunded, grossAmountEurCents: 12000 },
      client: { name: "Anna", surname: "Bianchi", deletedAt: null },
      quote: { guidedRequest: { category: { label: "Idraulico" } } },
    });
    const doc = { bookingId: "b1", kind: "RECEIPT", number: 4, year: 2026, ownNumber: null, pdfDownloadedAt: new Date("2026-10-20T10:00:00Z"), pdfTotalEurCents: 12000 };
    expect(courtesyDocumentSummary(doc, booking(0))).toMatchObject({ label: "Ricevuta n. 4/2026", customerName: "Anna Bianchi", jobLabel: "Idraulico", totalEurCents: 12000, amountChanged: false });
    expect(courtesyDocumentSummary(doc, booking(2000)).amountChanged).toBe(true);
    // Mai "cambiato" prima del primo PDF.
    expect(courtesyAmountChanged(null, 5000)).toBe(false);
    expect(courtesyTotalEurCents(null)).toBeNull();

    const summary = (year: number, kind: "RECEIPT" | "INVOICE", total: number | null): CourtesyDocumentSummary => ({
      bookingId: `${year}-${kind}-${total}`, kind, label: "", year, customerName: null, jobLabel: null, totalEurCents: total, pdfDownloadedAt: null, pdfTotalEurCents: null, amountChanged: false,
    });
    expect(courtesyYearTotals([summary(2026, "RECEIPT", 10000), summary(2026, "RECEIPT", 5000), summary(2026, "RECEIPT", null), summary(2027, "INVOICE", 3000)])).toEqual([
      { year: 2027, kind: "INVOICE", count: 1, totalEurCents: 3000, missingAmounts: 0 },
      { year: 2026, kind: "RECEIPT", count: 3, totalEurCents: 15000, missingAmounts: 1 },
    ]);
  });

  it("nome del documento nelle liste", () => {
    expect(courtesyDocumentLabel({ kind: "RECEIPT", number: 4, year: 2026, ownNumber: null })).toBe("Ricevuta n. 4/2026");
    expect(courtesyDocumentLabel({ kind: "INVOICE", number: null, year: 2026, ownNumber: "12/A" })).toBe("Fattura n. 12/A");
    expect(courtesyDocumentLabel({ kind: "INVOICE", number: null, year: 2026, ownNumber: null })).toBe("Fattura, numero non ancora scritto");
  });
});

describe("riepilogo dell'anno per il commercialista", () => {
  const paid = (cents: number) => ({ paymentMethod: "DIRECT", paidEurCents: 0, refundedEurCents: 0, grossAmountEurCents: cents, balancePaidAt: null, directReportedAt: new Date("2026-06-02T09:00:00Z") });
  const vatRequest = { kind: "VAT", name: "Bar Sport S.r.l.", taxCode: null, vatNumber: "12345678903", sdiRecipientCode: "ABC1234", pecEmail: null, street: "Via Roma", houseNumber: "1", postalCode: "00100", city: "Roma", province: "RM", updatedAt: new Date("2026-06-01T09:00:00Z") };
  const doc = (over: Record<string, unknown>, booking: Record<string, unknown>) => ({
    bookingId: "b",
    kind: "RECEIPT",
    number: null,
    year: 2026,
    ownNumber: null,
    pdfDownloadedAt: null,
    pdfTotalEurCents: null,
    ...over,
    booking: {
      scheduledAt: new Date("2026-05-01T08:00:00Z"),
      professionalCompletedAt: null,
      jobPayment: null,
      client: { name: "Anna", surname: "Bianchi", deletedAt: null },
      quote: { invoiceRequest: null, guidedRequest: { category: { label: "Idraulico" } } },
      ...booking,
    },
  });
  function build(documents: unknown[], fiscal: Record<string, unknown> = { entityType: "SOLE_PROPRIETOR", chargesVat: true, businessName: null, fiscalFirstName: "Mario", fiscalLastName: "Rossi" }) {
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ businessName: "Mario idraulico", fiscalProfile: fiscal }) },
      courtesyDocument: { findMany: vi.fn().mockResolvedValue(documents) },
    };
    const invoices = { profileIdOf: vi.fn().mockResolvedValue("pro-1") };
    return { service: new CourtesyCopyService(prisma as never, invoices as never, { record: vi.fn() } as never, {} as never), prisma };
  }

  it("ricevute in ordine di numero, fatture con l'IVA, bollo e clienti con partita IVA", async () => {
    const { service, prisma } = build([
      doc({ bookingId: "r2", number: 2 }, { jobPayment: paid(10000), quote: { invoiceRequest: vatRequest, guidedRequest: { category: { label: "Elettricista" } } } }),
      doc({ bookingId: "f1", kind: "INVOICE", ownNumber: "12/A", pdfTotalEurCents: 15000 }, { jobPayment: paid(12200), professionalCompletedAt: new Date("2026-07-10T22:30:00Z") }),
      doc({ bookingId: "r1", number: 1 }, { jobPayment: paid(5000) }),
    ]);
    const summary = await service.yearSummaryForProfessional("user-1", 2026);

    expect(prisma.courtesyDocument.findMany.mock.calls[0]![0].where).toEqual({ professionalProfileId: "pro-1", year: 2026, booking: { status: { not: "CANCELED" } } });
    expect(summary.who).toBe("Mario Rossi");
    expect(summary.receipts.map((r) => r.number)).toEqual(["1/2026", "2/2026"]);
    expect(summary.receipts[1]).toMatchObject({ customerName: "Bar Sport S.r.l.", customerHasVatNumber: true, stampDuty: true, vatEurCents: null, totalEurCents: 10000 });
    expect(summary.receipts[0]).toMatchObject({ customerName: "Anna Bianchi", customerHasVatNumber: false, stampDuty: false });
    // La fattura di chi applica l'IVA: niente bollo, l'IVA dentro il totale; importo cambiato dopo il PDF.
    expect(summary.invoices[0]).toMatchObject({ number: "12/A", totalEurCents: 12200, vatEurCents: 2200, stampDuty: false, amountChanged: true, date: "2026-07-10T22:30:00.000Z" });

    const csv = courtesyYearCsv(summary);
    const lines = csv.replace(/^\ufeff/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Documento;Numero;Data;Cliente;Cliente con partita IVA;Lavoro;Importo;di cui IVA;Marca da bollo");
    expect(lines[2]).toBe("Ricevuta per prestazione occasionale;2/2026;2026-06-02;Bar Sport S.r.l.;Sì;Elettricista;100,00;;Sì");
    // Data in ora italiana: le 22:30 del 10 luglio in UTC sono già l'11.
    expect(lines[3]).toBe("Copia della fattura;12/A;2026-07-11;Anna Bianchi;No;Idraulico;122,00;22,00;No");

    const model = courtesyYearPdfModel(summary, new Date("2027-01-15T10:00:00Z"));
    const texts = JSON.stringify(model.blocks);
    expect(model.title).toBe("Documenti dati ai clienti nel 2026");
    expect(texts).toContain("Totale ricevute");
    expect(texts).toContain("150,00");
    expect(texts).toContain("ritenuta d'acconto");
    expect(texts).toContain("marca da bollo");
    expect(texts).toContain("1 documento ha l'importo cambiato dopo il PDF");
    const pdf = await renderDocumentPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("forfettario: niente IVA e bollo anche sulla fattura; anno senza documenti", async () => {
    const { service } = build([doc({ bookingId: "f1", kind: "INVOICE" }, { jobPayment: paid(9000) })], { entityType: "SOLE_PROPRIETOR", chargesVat: false, businessName: "Ditta Rossi", fiscalFirstName: null, fiscalLastName: null });
    const summary = await service.yearSummaryForProfessional("user-1", 2026);
    expect(summary.who).toBe("Ditta Rossi");
    expect(summary.invoices[0]).toMatchObject({ number: null, vatEurCents: null, stampDuty: true });
    expect(JSON.stringify(courtesyYearPdfModel(summary).blocks)).not.toContain("Ricevute per prestazione occasionale");

    await expect(build([]).service.yearSummaryForProfessional("user-1", 2025)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("riepilogo dell'anno al commercialista a gennaio", () => {
  const statement: MonthlyStatement = {
    month: "2026-12",
    monthLabel: "dicembre 2026",
    totals: { onlineEurCents: 20000, directEurCents: 0, feesEurCents: 1708, payoutsArrivedEurCents: 18292 },
    rows: [],
    blockedEurCents: 0,
    feeInvoice: { id: "inv-1", number: "COM/2026/0012" },
    documentHint: "",
  };
  const row = { number: "1/2026", date: "2026-06-02T09:00:00.000Z", customerName: "Anna Bianchi", customerHasVatNumber: false, jobLabel: "Idraulico", totalEurCents: 5000, vatEurCents: null, stampDuty: false, amountChanged: false };
  const yearly = (receipts: (typeof row)[]): CourtesyYearSummary => ({ year: 2026, who: "Mario Rossi", receipts, invoices: [] });

  function build(movementsByProfile: Record<string, number>, yearlyByProfile: Record<string, CourtesyYearSummary>) {
    const recipient = (id: string) => ({ professionalProfileId: id, accountantEmail: `studio-${id}@esempio.it`, fiscalFirstName: "Mario", fiscalLastName: "Rossi", businessName: null, professionalProfile: { businessName: null } });
    const prisma = { professionalFiscalProfile: { findMany: vi.fn().mockResolvedValue(Object.keys(movementsByProfile).map(recipient)) } };
    const email = { send: vi.fn().mockResolvedValue(true) };
    const courtesy = { yearSummaryForProfile: vi.fn((id: string) => Promise.resolve(yearlyByProfile[id] ?? yearly([]))) };
    const service = new StatementsService(prisma as never, email as never, {} as never, courtesy as never);
    vi.spyOn(service, "build").mockImplementation((id: string) => Promise.resolve({ statement, csvRows: [], movements: movementsByProfile[id] ?? 0 }));
    return { service, email, courtesy };
  }

  it("il 1° gennaio parte con l'estratto di dicembre, o da solo se dicembre è vuoto", async () => {
    const { service, email, courtesy } = build({ a: 3, b: 0, c: 0 }, { a: yearly([row]), b: yearly([row]) });
    const sent = await service.sendAccountantStatements(new Date("2027-01-01T07:00:00Z"));

    expect(sent).toBe(2);
    expect(courtesy.yearSummaryForProfile).toHaveBeenCalledWith("a", 2026);
    const byTo = (to: string) => email.send.mock.calls.find(([p]) => p.to === to)?.[0];
    // Con i movimenti di dicembre: estratto e riepilogo nella stessa email.
    const withStatement = byTo("studio-a@esempio.it");
    expect(withStatement.subject).toBe("Estratto di dicembre 2026 e riepilogo del 2026 di Mario Rossi");
    expect(withStatement.attachments.map((a: { filename: string }) => a.filename)).toEqual(["estratto-2026-12.pdf", "estratto-2026-12.csv", "documenti-clienti-2026.pdf", "documenti-clienti-2026.csv"]);
    // Dicembre senza movimenti: solo il riepilogo.
    const onlyYearly = byTo("studio-b@esempio.it");
    expect(onlyYearly.subject).toBe("Riepilogo del 2026 di Mario Rossi");
    expect(onlyYearly.attachments.map((a: { filename: string }) => a.filename)).toEqual(["documenti-clienti-2026.pdf", "documenti-clienti-2026.csv"]);
    expect(onlyYearly.attachments[1].content).toContain("Ricevuta per prestazione occasionale;1/2026");
    // Niente movimenti e nessun documento: nessuna email.
    expect(byTo("studio-c@esempio.it")).toBeUndefined();
  });

  it("negli altri mesi il riepilogo non c'è", async () => {
    const { service, email, courtesy } = build({ a: 2, b: 0 }, { a: yearly([row]), b: yearly([row]) });
    expect(await service.sendAccountantStatements(new Date("2027-02-01T07:00:00Z"))).toBe(1);
    expect(courtesy.yearSummaryForProfile).not.toHaveBeenCalled();
    expect(email.send.mock.calls[0]![0].attachments).toHaveLength(2);
  });

  it("testo dell'email con e senza estratto", () => {
    const both = accountantStatementEmail("Mario Rossi", statement, { ...yearly([row]), invoices: [{ ...row, number: "12/A", totalEurCents: 12200, vatEurCents: 2200 }] });
    expect(both.paragraphs.join(" ")).toContain("C'è anche il **riepilogo del 2026**: i documenti dati ai clienti nell'anno (le ricevute per prestazione occasionale e le copie delle fatture), in PDF e nel foglio di calcolo.");
    expect(both.details).toContainEqual({ label: "Ricevute del 2026", value: "50,00 €" });
    expect(both.details).toContainEqual({ label: "Copie delle fatture del 2026", value: "122,00 €" });

    const alone = accountantStatementEmail("Mario Rossi", null, yearly([row]));
    expect(alone.title).toBe("Riepilogo del 2026");
    expect(alone.paragraphs).toEqual(["Le mandiamo il **riepilogo del 2026** di **Mario Rossi**, come ci ha chiesto: i documenti dati ai clienti nell'anno (le ricevute per prestazione occasionale), in PDF e nel foglio di calcolo. A dicembre non ci sono stati movimenti, quindi niente estratto del mese."]);
    expect(alone.details).toEqual([{ label: "Ricevute del 2026", value: "50,00 €" }]);
  });
});

describe("documenti da sistemare a dicembre", () => {
  const doc = (professionalProfileId: string, bookingId: string, number: number, pdfTotalEurCents: number | null, grossAmountEurCents: number | null) => ({
    bookingId,
    professionalProfileId,
    kind: "RECEIPT",
    number,
    year: 2026,
    ownNumber: null,
    pdfDownloadedAt: pdfTotalEurCents !== null ? new Date("2026-06-02T09:00:00Z") : null,
    pdfTotalEurCents,
    booking: {
      jobPayment: grossAmountEurCents !== null ? { paymentMethod: "DIRECT", paidEurCents: 0, refundedEurCents: 0, grossAmountEurCents } : null,
      client: { name: "Anna", surname: "Bianchi", deletedAt: null },
      quote: { guidedRequest: { category: { label: "Idraulico" } } },
    },
  });

  it("il 15 dicembre avvisa solo chi ha documenti con l'importo cambiato o senza importo", async () => {
    const prisma = {
      courtesyDocument: {
        findMany: vi.fn().mockResolvedValue([
          doc("p1", "b1", 1, 10000, 8000),
          doc("p1", "b2", 2, null, 5000),
          doc("p1", "b3", 3, null, null),
          doc("p2", "b4", 1, 5000, 5000),
          doc("p3", "b5", 1, 9000, 7000),
        ]),
      },
      booking: { findMany: vi.fn().mockResolvedValue([]) },
      // p3 ha chiuso l'account: non torna dalla ricerca.
      professionalProfile: { findMany: vi.fn().mockResolvedValue([{ id: "p1", userId: "u1", fiscalProfile: { accountantStatementsAt: new Date(), accountantEmail: "studio@esempio.it" } }]) },
    };
    const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    const service = new CourtesyCopyService(prisma as never, {} as never, {} as never, notifications as never);

    expect(await service.remindDocumentsToFix(new Date("2026-12-15T08:00:00Z"))).toBe(1);
    expect(prisma.courtesyDocument.findMany.mock.calls[0]![0].where).toEqual({ year: 2026, booking: { status: { not: "CANCELED" } } });
    expect(prisma.professionalProfile.findMany.mock.calls[0]![0].where).toEqual({ id: { in: ["p1", "p3"] }, user: { deletedAt: null } });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("u1", "CLIENT_DOCUMENTS_TO_FIX", {
      year: 2026,
      accountant: true,
      documents: [
        { label: "Ricevuta n. 1/2026", customerName: "Anna Bianchi", reason: "AMOUNT_CHANGED" },
        { label: "Ricevuta n. 3/2026", customerName: "Anna Bianchi", reason: "MISSING_AMOUNT" },
      ],
    });
  });

  it("email con l'elenco e cosa fare", () => {
    const ctx = { name: "Mario", category: null, city: null, businessName: null, when: null, proposedWhen: null };
    const payload = { year: 2026, accountant: true, documents: [{ label: "Ricevuta n. 1/2026", customerName: "Anna Bianchi", reason: "AMOUNT_CHANGED" }, { label: "Ricevuta n. 3/2026", customerName: null, reason: "MISSING_AMOUNT" }] };
    const email = renderEmail(notificationEmail("CLIENT_DOCUMENTS_TO_FIX", payload, ctx)!);
    expect(email.subject).toBe("Documenti da sistemare prima di fine anno");
    expect(email.text).toContain("Prima del riepilogo del 2026 ci sono 2 documenti dati ai clienti da sistemare.");
    expect(email.text).toContain("Ricevuta n. 1/2026, Anna Bianchi: Importo cambiato dopo il PDF");
    expect(email.text).toContain("Ricevuta n. 3/2026: Senza importo");
    expect(email.text).toContain("Il 1° gennaio il riepilogo parte da solo al tuo commercialista.");
    const single = renderEmail(notificationEmail("CLIENT_DOCUMENTS_TO_FIX", { ...payload, accountant: false, documents: payload.documents.slice(0, 1) }, ctx)!);
    expect(single.subject).toBe("Un documento da sistemare prima di fine anno");
    expect(single.text).toContain("Poi scarica il riepilogo dell'anno per il tuo commercialista.");
  });

  it("per chi fa le ricevute anche i lavori terminati senza ricevuta o con la ricevuta mai scaricata (§387)", async () => {
    const completed = (bookingId: string, at: string | null, scheduledAt: string) => ({
      professionalProfileId: "p1",
      professionalCompletedAt: at ? new Date(at) : null,
      scheduledAt: new Date(scheduledAt),
      jobPayment: null,
      client: { name: "Sara", surname: "Neri", deletedAt: null },
      quote: { guidedRequest: { category: { label: "Idraulico" } } },
    });
    const notDownloaded = { ...doc("p1", "b6", 6, null, 5000), booking: { ...doc("p1", "b6", 6, null, 5000).booking, status: "COMPLETED" } };
    const notFinished = { ...doc("p1", "b7", 7, null, 5000), booking: { ...doc("p1", "b7", 7, null, 5000).booking, status: "CONFIRMED" } };
    const prisma = {
      courtesyDocument: { findMany: vi.fn().mockResolvedValue([notDownloaded, notFinished]) },
      booking: {
        findMany: vi.fn().mockResolvedValue([
          completed("b8", "2026-11-12T10:00:00Z", "2026-11-12T08:00:00Z"),
          // Terminato a Capodanno 2027 alle 0:30 di Roma: è dell'anno dopo.
          completed("b9", "2026-12-31T23:30:00Z", "2026-12-31T20:00:00Z"),
          completed("b10", null, "2026-03-02T08:00:00Z"),
        ]),
      },
      professionalProfile: { findMany: vi.fn().mockResolvedValue([{ id: "p1", userId: "u1", fiscalProfile: null }]) },
    };
    const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    const service = new CourtesyCopyService(prisma as never, {} as never, {} as never, notifications as never);

    expect(await service.remindDocumentsToFix(new Date("2026-12-15T08:00:00Z"))).toBe(1);
    const where = prisma.booking.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "COMPLETED", courtesyDocument: { is: null }, professionalProfile: { fiscalProfile: { is: { entityType: "PRIVATE_INDIVIDUAL" } } } });
    expect(where.OR[0].professionalCompletedAt).toEqual({ gte: new Date("2025-12-31T23:00:00Z"), lt: new Date("2026-12-31T23:00:00Z") });
    expect(notifications.notify.mock.calls[0]![2].documents).toEqual([
      { label: "Ricevuta n. 6/2026", customerName: "Anna Bianchi", reason: "NOT_DOWNLOADED" },
      { label: "Idraulico del 2 marzo 2026", customerName: "Sara Neri", reason: "NO_RECEIPT" },
      { label: "Idraulico del 12 novembre 2026", customerName: "Sara Neri", reason: "NO_RECEIPT" },
    ]);
  });

  it("email con le ricevute da fare: cosa fare e il link alle richieste", () => {
    const ctx = { name: "Mario", category: null, city: null, businessName: null, when: null, proposedWhen: null };
    const missing = renderEmail(notificationEmail("CLIENT_DOCUMENTS_TO_FIX", { year: 2026, accountant: false, documents: [{ label: "Idraulico del 12 novembre 2026", customerName: "Sara Neri", reason: "NO_RECEIPT" }] }, ctx)!);
    expect(missing.text).toContain("Idraulico del 12 novembre 2026, Sara Neri: Manca la ricevuta");
    expect(missing.text).toContain("Se manca la ricevuta, preparala dal lavoro, scarica il PDF e dalla al cliente. Se l'hai fatta a mano, dillo al tuo commercialista: nel riepilogo non c'è.");
    expect(missing.text).not.toContain("Se l'importo è cambiato");
    expect(missing.text).toContain("/dashboard/richieste");
    const mixed = renderEmail(
      notificationEmail("CLIENT_DOCUMENTS_TO_FIX", { year: 2026, accountant: false, documents: [{ label: "Ricevuta n. 6/2026", customerName: null, reason: "NOT_DOWNLOADED" }, { label: "Ricevuta n. 1/2026", customerName: null, reason: "AMOUNT_CHANGED" }] }, ctx)!,
    );
    expect(mixed.text).toContain("Ricevuta n. 6/2026: Ricevuta mai scaricata");
    expect(mixed.text).toContain("Se l'importo è cambiato");
    expect(mixed.text).not.toContain("Se manca l'importo");
    expect(mixed.text).toContain("/dashboard/documenti");
  });
});

describe("invio allo SdI con Openapi", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(responses: { status: number; body: unknown }[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init: RequestInit) => {
        calls.push({ url, init });
        const next = responses.shift() ?? { status: 500, body: null };
        return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } }));
      }),
    );
    return calls;
  }

  it("motivo dello scarto, con uno o più errori", () => {
    expect(sdiRejectionMessage({ lista_errori: { Errore: { Codice: "00305", Descrizione: "IdFiscaleIVA del cessionario non valido" } } })).toBe("00305: IdFiscaleIVA del cessionario non valido");
    expect(sdiRejectionMessage({ lista_errori: { Errore: [{ Codice: "00400", Descrizione: "A" }, { Descrizione: "B" }] } })).toBe("00400: A; B");
    expect(sdiRejectionMessage({})).toBeNull();
  });

  it("vale l'ultimo esito della fattura", () => {
    const body = {
      data: [
        { type: "NS", created_at: "2026-10-01T10:00:00+00:00", message: { lista_errori: { Errore: { Codice: "00305", Descrizione: "X" } } } },
        { type: "RC", created_at: "2026-10-02T10:00:00+00:00", message: {} },
      ],
    };
    expect(sdiOutcomeFromNotifications("u1", body)).toEqual({ sdiId: "u1", status: "DELIVERED", message: null });
    expect(sdiOutcomeFromNotifications("u1", { data: [body.data[0]] })).toEqual({ sdiId: "u1", status: "REJECTED", message: "00305: X" });
    expect(sdiOutcomeFromNotifications("u1", { data: [] })).toBeNull();
  });

  it("registra la società una volta sola, poi manda l'XML e legge l'esito della fattura", async () => {
    const calls = stubFetch([
      { status: 404, body: { success: false, message: "Fiscal ID not found or not registered" } },
      { status: 200, body: { success: true, data: { fiscal_id: "12345678903", active: true } } },
      { status: 200, body: { success: true, data: { uuid: "abc-123" } } },
      { status: 404, body: { success: false } },
    ]);
    const provider = new OpenapiSdiProvider("tok", true);
    await provider.ensureRegistered(sdiCompanyOf(issuer));
    await provider.ensureRegistered(sdiCompanyOf(issuer));
    expect((await provider.send("<xml/>")).sdiId).toBe("abc-123");
    expect(await provider.outcome("abc-123")).toBeNull();

    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET https://test.sdi.openapi.it/business_registry_configurations/12345678903",
      "POST https://test.sdi.openapi.it/business_registry_configurations",
      "POST https://test.sdi.openapi.it/invoices_legal_storage",
      "GET https://test.sdi.openapi.it/invoices_notifications/abc-123",
    ]);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ fiscal_id: "12345678903", name: "Professionisti S.r.l.", email: "societa@pec.it", apply_signature: false, apply_legal_storage: true });
    expect((calls[2]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/xml");
  });

  it("società sospesa e simulazione solo nella prova", async () => {
    stubFetch([{ status: 200, body: { data: { active: false } } }]);
    await expect(new OpenapiSdiProvider("tok", false).ensureRegistered(sdiCompanyOf(issuer))).rejects.toThrow("sospesa");
    await expect(new OpenapiSdiProvider("tok", false).simulateOutcome("abc", "RC")).rejects.toThrow("solo nella prova");
  });

  it("senza PEC la società non si registra", () => {
    expect(() => sdiCompanyOf({ ...issuer, pecEmail: null })).toThrow("PEC");
  });

  it("fattura di prova: cliente inventato, numero fuori dalle nostre serie", () => {
    const xml = sandboxTestInvoiceXml(issuer, new Date("2026-10-27T10:00:00Z"));
    expect(xml).toContain("<TipoDocumento>TD01</TipoDocumento>");
    expect(xml).toContain("<CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale>");
    expect(xml).toMatch(/<Numero>PROVA-[0-9A-Z]+<\/Numero>/);
    expect(xml).toContain("<ImportoTotaleDocumento>1.22</ImportoTotaleDocumento>");
  });
});
