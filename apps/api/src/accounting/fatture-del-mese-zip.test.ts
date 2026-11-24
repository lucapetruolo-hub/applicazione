import { describe, expect, it, vi } from "vitest";
import { InvoicesService } from "./invoices.service";

/** Fatture del mese in uno zip per il commercialista (docs/changelog/2026-11-24-fatture-del-mese-zip.md). */
const party = { name: "Prova SRL", lines: ["P.IVA 12345678903"] };
const view = {
  id: "i",
  number: "COM/2026/0017",
  source: "JOB_FEES",
  creditNote: false,
  periodMonth: "2026-10",
  issuedAt: "2026-10-31T10:00:00Z",
  totalEurCents: 854,
  sdiStatus: "SENT",
  issuer: party,
  recipient: { name: "Idraulica Rossi", lines: [] },
  lines: [{ description: "Trattenuta", detail: null, group: null, taxableEurCents: 700 }],
  taxableEurCents: 700,
  vatEurCents: 154,
  roundingEurCents: 0,
  vatRatePercent: 22,
  relatedNumber: null,
  vatRecoverable: true,
  onlinePaidEurCents: 10000,
};

type Row = { id: string; series: string; year: number; number: number; xml: string | null; sdiMessage?: string | null; recipient?: unknown };

function build(rows: Row[]) {
  const prisma = { invoice: { findMany: vi.fn().mockResolvedValue(rows) } };
  const service = new InvoicesService(prisma as never, { notify: vi.fn() } as never);
  vi.spyOn(service, "invoiceView").mockResolvedValue(view as never);
  return { service, prisma };
}

describe("InvoicesService.adminMonthZip", () => {
  it("mette XML e PDF di ogni fattura del mese, cercando per data del documento", async () => {
    const { service, prisma } = build([
      { id: "a", series: "ABB", year: 2026, number: 3, xml: "<a/>", recipient: { vatNumber: "01234567897", taxCode: null } },
      { id: "b", series: "COM", year: 2026, number: 17, xml: "<b/>" },
      { id: "c", series: "COM", year: 2026, number: 18, xml: null, sdiMessage: "Dati fiscali del professionista incompleti" },
    ]);
    const result = await service.adminMonthZip("2026-10");
    expect(result.fileName).toBe("fatture-2026-10.zip");
    expect(result.count).toBe(3);
    expect(result.missingXml).toBe(1);
    const names = result.zip.toString("latin1");
    expect(names).toContain("xml/ABB-2026-0003.xml");
    expect(names).toContain("pdf/COM-2026-0017.pdf");
    // Senza XML: solo il PDF, e la riga in "da-sistemare.txt".
    expect(names).toContain("pdf/COM-2026-0018.pdf");
    expect(names).not.toContain("xml/COM-2026-0018.xml");
    expect(names).toContain("COM/2026/0018: Dati fiscali del professionista incompleti");
    // Il riepilogo per il foglio di calcolo: una riga per fattura, importi all'italiana.
    expect(names).toContain("riepilogo.csv");
    expect(names).toContain("Numero;Data;Tipo documento;Servizio");
    expect(names).toContain("COM/2026/0017;2026-10-31;TD24 Fattura differita;Trattenute sui pagamenti online;;Idraulica Rossi;01234567897;;7,00;1,54;8,54;S");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "ISSUED", issuedAt: expect.any(Object) }) }));
  });

  it("mese scritto male o senza fatture: errore chiaro", async () => {
    await expect(build([]).service.adminMonthZip("ottobre")).rejects.toThrow("Mese non valido");
    await expect(build([]).service.adminMonthZip("2026-10")).rejects.toThrow("Nessuna fattura in quel mese.");
  });
});
