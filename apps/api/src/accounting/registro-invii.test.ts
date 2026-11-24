import { describe, expect, it, vi } from "vitest";
import { InvoicesService } from "./invoices.service";

/** Registro invii di Admin → Fisco e fatture (docs/changelog/2026-11-24-fatture-del-mese-zip.md). */
describe("InvoicesService.adminSends", () => {
  it("mette insieme fatture allo SdI, prove e zip al commercialista, dal più recente", async () => {
    const prisma = {
      invoice: {
        findMany: vi.fn().mockResolvedValue([
          { id: "a", series: "COM", year: 2026, number: 1, creditNote: false, sdiSentAt: new Date("2026-11-01T07:00:00Z"), sdiStatus: "DELIVERED", sdiMessage: null, sdiId: "x1", recipient: { companyName: "Idraulica Rossi", entityType: "COMPANY", country: "IT" } },
        ]),
      },
      fiscalSendLog: {
        findMany: vi.fn().mockResolvedValue([
          { id: "l1", kind: "SDI_TEST", month: null, recipient: "Servizio di invio (prova)", result: "ok", detail: "Esito letto: Consegnata", externalId: "01a2", createdByUserId: "admin", createdAt: new Date("2026-11-24T14:18:00Z") },
          { id: "l2", kind: "ACCOUNTANT_ZIP", month: "2026-10", recipient: "studio@example.com", result: "failed", detail: null, externalId: null, createdByUserId: null, createdAt: new Date("2026-11-05T08:00:00Z") },
        ]),
      },
    };
    const service = new InvoicesService(prisma as never, { notify: vi.fn() } as never);
    const rows = await service.adminSends();
    expect(rows.map((r) => r.kind)).toEqual(["SDI_TEST", "ACCOUNTANT_ZIP", "INVOICE"]);
    expect(rows[0]).toMatchObject({ what: "Fattura di prova da 1 €", outcome: "ok", outcomeLabel: "Riuscita", externalId: "01a2", manual: true });
    expect(rows[1]).toMatchObject({ what: "Fatture di ottobre 2026 al commercialista", outcome: "error", manual: false });
    expect(rows[2]).toMatchObject({ what: "Fattura COM/2026/0001", outcome: "ok", outcomeLabel: "Consegnata" });
  });
});
