import { describe, expect, it } from "vitest";
import { renderDocumentPdf } from "../accounting/document-pdf";
import { dataExportPdfModel } from "./data-export-pdf";

/** "Scarica i tuoi dati" in PDF leggibile (controllo pre-lancio 08/11, E4-09). */
describe("dataExportPdfModel", () => {
  const data = {
    exportedAt: "2026-11-08T10:00:00.000Z",
    account: { id: "u1", email: "giulia@example.com", name: "Giulia", sessionVersion: 3, deletedEmailHash: null, createdAt: new Date("2026-10-01T08:00:00Z") },
    guidedRequests: [{ id: "r1", description: "Perde il rubinetto", categoryId: "c1", quotes: [{ id: "q1", items: [{ label: "Manodopera", priceMinEurCents: 5000 }] }] }],
    bookingsAsClient: [],
    reviewsWritten: [],
    savedProfessionals: [],
    professional: null,
  };

  it("titoli e campi in italiano, niente codici interni, importi in euro", () => {
    const model = dataExportPdfModel(data);
    const flat = JSON.stringify(model);
    expect(flat).toContain("Il tuo account");
    expect(flat).toContain("giulia@example.com");
    expect(flat).toContain("Le tue richieste di preventivo");
    expect(flat).toContain("Perde il rubinetto");
    expect(flat).toContain("50,00 €");
    expect(flat).toContain("ottobre 2026");
    expect(flat).not.toContain("sessionVersion");
    expect(flat).not.toContain("\"c1\"");
    expect(flat).toContain("Nessun dato.");
    // Campi degli importi in italiano e "l'8 novembre" (controllo dei PDF del 16/11/2026).
    expect(flat).toContain("Prezzo da");
    expect(flat).not.toContain("Price min");
    expect(flat).toContain("scaricata l'8 novembre 2026");
  });

  it("si stampa in un PDF", async () => {
    const pdf = await renderDocumentPdf(dataExportPdfModel(data));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
