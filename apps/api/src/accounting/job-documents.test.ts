import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { JobDocumentsService } from "./job-documents.service";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { courtesyPdfModel } from "./document-pdf-models";

// Documenti di un lavoro dal menu della richiesta (docs/CHANGELOG.md §386) e avviso al cliente (§387).

const paid = {
  paymentMethod: "MANOVIA",
  grossAmountEurCents: 12000,
  depositEurCents: 2400,
  depositPaidAt: new Date("2026-10-02T09:00:00Z"),
  balancePaidAt: new Date("2026-10-20T15:00:00Z"),
  paidEurCents: 12000,
  refundedEurCents: 2000,
  directReportedAt: null,
  payoutSentEurCents: 8975,
  payoutPaidAt: new Date("2026-10-29T08:00:00Z"),
  refunds: [{ amountEurCents: 2000, processedAt: new Date("2026-10-25T10:00:00Z"), createdAt: new Date("2026-10-24T10:00:00Z") }],
  feeEntries: [
    { kind: "HOLD", grossEurCents: 1025, description: "Trattenuta", occurredAt: new Date("2026-10-20T15:00:00Z"), invoice: { id: "inv-1", series: "COM", year: 2026, number: 12 } },
    { kind: "RETURN", grossEurCents: -171, description: "Trattenuta restituita per un rimborso", occurredAt: new Date("2026-10-25T10:00:00Z"), invoice: null },
  ],
};

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    clientId: "client-1",
    status: "COMPLETED",
    professionalProfile: { userId: "pro-1", fiscalProfile: { entityType: "PRIVATE_INDIVIDUAL" } },
    courtesyDocument: { kind: "RECEIPT", number: 4, year: 2026, ownNumber: null, pdfDownloadedAt: new Date("2026-10-26T10:00:00Z"), pdfTotalEurCents: 10000 },
    quote: { invoiceRequest: null },
    jobPayment: paid,
    ...over,
  };
}

function service(found: unknown) {
  const prisma = { booking: { findUnique: vi.fn().mockResolvedValue(found) } };
  return new JobDocumentsService(prisma as never);
}

describe("documenti del lavoro", () => {
  it("il professionista vede documento, movimenti con le trattenute e l'estratto del mese", async () => {
    const view = await service(booking()).forUser("pro-1", "b1");
    expect(view.audience).toBe("PROFESSIONAL");
    expect(view.clientDocument).toEqual({ label: "Ricevuta n. 4/2026", kind: "RECEIPT", amountChanged: false });
    expect(view.movements.map((m) => [m.label, m.amountEurCents])).toEqual([
      ["Acconto pagato online dal cliente", 2400],
      ["Saldo pagato online dal cliente", 9600],
      ["Nostra trattenuta (IVA compresa)", -1025],
      ["Rimborso al cliente", -2000],
      ["Trattenuta restituita per un rimborso", 171],
      ["Bonifico arrivato in banca", 8975],
    ]);
    expect(view.movements[2]!.invoice).toEqual({ id: "inv-1", number: "COM/2026/0012" });
    expect(view.statementMonths).toEqual([{ month: "2026-10", label: "ottobre 2026" }]);
  });

  it("il cliente vede i suoi pagamenti, mai le trattenute, e la copia solo con lo stesso importo del PDF", async () => {
    const view = await service(booking()).forUser("client-1", "b1");
    expect(view.audience).toBe("CLIENT");
    expect(view.clientDocument).toEqual({ label: "Ricevuta n. 4/2026", kind: "RECEIPT", amountChanged: false });
    expect(view.movements.map((m) => [m.label, m.amountEurCents])).toEqual([
      ["Acconto pagato online", -2400],
      ["Saldo pagato online", -9600],
      ["Rimborso ricevuto", 2000],
    ]);
    expect(view.movements.every((m) => m.invoice === null)).toBe(true);
    expect(view.statementMonths).toEqual([]);

    // Importo cambiato dopo il PDF: il professionista lo vede da rifare, il cliente non vede la copia.
    const changed = { ...booking().courtesyDocument, pdfTotalEurCents: 12000 };
    expect((await service(booking({ courtesyDocument: changed })).forUser("pro-1", "b1")).clientDocument?.amountChanged).toBe(true);
    expect((await service(booking({ courtesyDocument: changed })).forUser("client-1", "b1")).clientDocument).toBeNull();
    // Mai scaricato dal professionista: il cliente non la vede.
    const notDownloaded = { ...booking().courtesyDocument, pdfDownloadedAt: null };
    expect((await service(booking({ courtesyDocument: notDownloaded })).forUser("client-1", "b1")).clientDocument).toBeNull();
  });

  it("pagamento diretto, fattura chiesta e lavoro non ancora terminato: il documento aspetta \"Lavoro terminato\" (collaudo C-02)", async () => {
    const direct = { ...paid, paymentMethod: "DIRECT", directReportedAt: new Date("2026-10-20T15:00:00Z"), depositPaidAt: null, balancePaidAt: null, refunds: [], feeEntries: [], payoutPaidAt: null };
    const view = await service(booking({ status: "CONFIRMED", courtesyDocument: null, quote: { invoiceRequest: { id: "r1" } }, jobPayment: direct })).forUser("client-1", "b1");
    expect(view.movements).toEqual([{ date: "2026-10-20T15:00:00.000Z", label: "Pagato direttamente al professionista", amountEurCents: -12000, invoice: null }]);
    expect(view.invoiceRequested).toBe(true);
    expect(view.clientDocumentAvailable).toBe(false);
    const confirmed = await service(booking({ status: "CONFIRMED", courtesyDocument: null })).forUser("pro-1", "b1");
    expect(confirmed.clientDocumentAvailable).toBe(false);
  });

  it("con la partita IVA la fattura la fa il professionista: niente ricevuta sul sito", async () => {
    const pro = { userId: "pro-1", fiscalProfile: { entityType: "SOLE_PROPRIETOR" } };
    const view = await service(booking({ professionalProfile: pro, courtesyDocument: null })).forUser("pro-1", "b1");
    expect(view).toMatchObject({ ownInvoice: true, clientDocumentAvailable: false, clientDocument: null });
    const client = await service(booking({ professionalProfile: pro, courtesyDocument: null })).forUser("client-1", "b1");
    expect(client.ownInvoice).toBe(true);
  });

  it("un estraneo non vede niente", async () => {
    await expect(service(booking()).forUser("altro", "b1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service(null).forUser("client-1", "b1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("copia per il cliente", () => {
  const loaded = (over: Record<string, unknown> = {}) => ({
    id: "b1",
    clientId: "client-1",
    status: "COMPLETED",
    professionalProfileId: "p1",
    scheduledAt: new Date("2026-10-20T08:00:00Z"),
    professionalCompletedAt: new Date("2026-10-20T15:00:00Z"),
    street: "Via Roma",
    houseNumber: "1",
    postalCode: "00100",
    city: "Roma",
    province: "RM",
    recipientName: null,
    recipientSurname: null,
    client: { name: "Anna", surname: "Bianchi" },
    finalItems: [],
    jobPayment: { paymentMethod: "DIRECT", balanceDirect: false, paidEurCents: 0, refundedEurCents: 0, grossAmountEurCents: 10000, balancePaidAt: null, directReportedAt: new Date("2026-10-20T15:00:00Z") },
    professionalProfile: { businessName: null, fiscalProfile: { entityType: "PRIVATE_INDIVIDUAL", chargesVat: false, fiscalFirstName: "Mario", fiscalLastName: "Rossi", taxCode: "RSSMRA80A01H501U" } },
    quote: { invoiceRequest: { kind: "VAT", name: "Bar Sport S.r.l.", taxCode: null, vatNumber: "12345678903", sdiRecipientCode: null, pecEmail: null, street: "Via Roma", houseNumber: "1", postalCode: "00100", city: "Roma", province: "RM", updatedAt: new Date() }, guidedRequest: { description: "Perdita", category: { label: "Idraulico" } } },
    ...over,
  });
  function build(found: unknown, saved: unknown) {
    const prisma = {
      booking: { findUnique: vi.fn().mockResolvedValue(found) },
      courtesyDocument: { findUnique: vi.fn().mockResolvedValue(saved) },
    };
    return new CourtesyCopyService(prisma as never, {} as never, {} as never, {} as never);
  }
  const saved = { kind: "RECEIPT", pdfDownloadedAt: new Date(), pdfTotalEurCents: 10000, number: 4, year: 2026, ownNumber: null };

  it("solo il cliente del lavoro, dopo il PDF del professionista e con lo stesso importo", async () => {
    const copy = await build(loaded(), saved).forClient("client-1", "b1");
    expect(copy.number).toBe("4/2026");
    // Il consiglio sulla ritenuta è per il professionista.
    expect(copy.notes.some((note) => note.includes("ritenuta"))).toBe(false);
    const model = courtesyPdfModel(copy, "client");
    expect(model.title).toBe("Copia della ricevuta per prestazione occasionale");
    expect(JSON.stringify(model.blocks)).toContain("te la dà il professionista");
    expect(JSON.stringify(model.blocks)).not.toContain("signature");

    await expect(build(loaded(), saved).forClient("altro", "b1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(loaded(), { ...saved, pdfDownloadedAt: null }).forClient("client-1", "b1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(loaded(), { ...saved, pdfTotalEurCents: 9000 }).forClient("client-1", "b1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(loaded({ status: "CANCELED" }), saved).forClient("client-1", "b1")).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("avviso al cliente quando il professionista scarica il PDF", () => {
    function download(previous: { pdfDownloadedAt: Date | null; pdfTotalEurCents: number | null } | null, over: Record<string, unknown> = {}) {
      const booking = loaded({ quote: { ...loaded().quote, guidedRequestId: "g1" }, ...over });
      const prisma = {
        booking: { findUnique: vi.fn().mockResolvedValue(booking) },
        courtesyDocument: {
          findUnique: vi.fn().mockResolvedValue(previous ? { ...saved, ...previous } : null),
          upsert: vi.fn().mockResolvedValue({ kind: "RECEIPT", number: 4, year: 2026, ownNumber: null }),
        },
      };
      const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
      const service = new CourtesyCopyService(prisma as never, { profileIdOf: vi.fn().mockResolvedValue("p1") } as never, {} as never, notifications as never);
      return { service, notifications };
    }

    it("al primo PDF il cliente sa che la copia è pronta", async () => {
      const { service, notifications } = download({ pdfDownloadedAt: null, pdfTotalEurCents: null });
      await service.forProfessionalPdf("pro-1", "b1");
      expect(notifications.notify).toHaveBeenCalledWith("client-1", "JOB_DOCUMENT_READY", {
        bookingId: "b1",
        guidedRequestId: "g1",
        category: "Idraulico",
        kind: "RECEIPT",
        label: "Ricevuta n. 4/2026",
        updated: false,
      });
    });

    it("di nuovo con lo stesso importo niente avviso, con un importo diverso l'avviso della copia aggiornata", async () => {
      const same = download({ pdfDownloadedAt: new Date(), pdfTotalEurCents: 10000 });
      await same.service.forProfessionalPdf("pro-1", "b1");
      expect(same.notifications.notify).not.toHaveBeenCalled();

      const changed = download({ pdfDownloadedAt: new Date(), pdfTotalEurCents: 12000 });
      await changed.service.forProfessionalPdf("pro-1", "b1");
      expect(changed.notifications.notify.mock.calls[0]![2]).toMatchObject({ updated: true });
    });

    it("senza importo niente PDF e niente avviso: prima il lavoro va chiuso con il prezzo finale", async () => {
      const { service, notifications } = download({ pdfDownloadedAt: null, pdfTotalEurCents: null }, { jobPayment: null });
      await expect(service.forProfessionalPdf("pro-1", "b1")).rejects.toThrow("l'importo finale del lavoro");
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
