import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotePdfService } from "./quote-pdf.service";

/**
 * Acconto non rimborsabile dopo il preavviso, con giorno e ora, anche nel PDF
 * del preventivo (decisione di Luca dell'11/11/2026,
 * docs/changelog/2026-11-11-rosso-solo-errori.md).
 */
function quote(lateCancelKeepsDeposit: boolean) {
  return {
    id: "q1",
    status: "SENT",
    createdAt: new Date("2026-11-08T10:00:00.000Z"),
    resentAt: null,
    estimatedStartDate: new Date("2026-11-20T08:00:00.000Z"),
    estimatedEndDate: new Date("2026-11-20T13:00:00.000Z"),
    cancellationNoticeHours: 24,
    lateCancelKeepsDeposit,
    paymentOptions: ["ONLINE", "DIRECT"],
    depositPercent: 20,
    notes: null,
    items: [{ id: "i1", name: "Riparazione", priceMinEurCents: 8000, priceMaxEurCents: 12000 }],
    guidedRequest: { clientId: "c1", description: "Scaldabagno", city: "Latina", serviceMode: "AT_HOME", category: { label: "Idraulico" } },
    professionalProfile: {
      userId: "p1",
      businessName: "Idraulica Prova",
      city: "Latina",
      cancellationNoticeHours: 24,
      fiscalProfile: { stripePayoutsEnabled: true, entityType: "INDIVIDUAL_VAT", chargesVat: true, businessName: null, fiscalFirstName: "Mario", fiscalLastName: "Rossi", vatNumber: "01234567890", registeredCity: "Latina", registeredProvince: "LT" },
    },
    booking: null,
  };
}

function textOf(model: unknown): string {
  return JSON.stringify(model).replace(/\u00a0/g, " ");
}

describe("PDF del preventivo: annullare", () => {
  // Pagamenti online accesi (onlinePaymentsEnabled legge solo la presenza della chiave).
  beforeEach(() => vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_finta"));
  afterEach(() => vi.unstubAllEnvs());

  it("con l'acconto trattenuto dice fino a quando si annulla gratis e che dopo non è rimborsabile", async () => {
    const prisma = { quote: { findUnique: vi.fn().mockResolvedValue(quote(true)) } };
    const service = new QuotePdfService(prisma as never, {} as never);
    const { model } = await service.forUser("c1", "q1");
    expect(textOf(model)).toContain("Pagando online: annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto di 24,00 € non è rimborsabile.");
  });

  // Dentro il preavviso la data "fino a…" sarebbe già passata
  // (docs/changelog/2026-11-13-annullare-data-passata.md).
  it("dentro il preavviso non dà una data già passata", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T12:00:00.000Z"));
    try {
      const prisma = { quote: { findUnique: vi.fn().mockResolvedValue(quote(true)) } };
      const service = new QuotePdfService(prisma as never, {} as never);
      const text = textOf((await service.forUser("c1", "q1")).model);
      expect(text).toContain("Pagando online: mancano meno di 24 ore all'appuntamento, l'acconto di 24,00 € non è rimborsabile, anche se annulli.");
      expect(text).not.toContain("annullamento gratuito fino a");
    } finally {
      vi.useRealTimers();
    }
  });

  it("senza acconto trattenuto resta solo il preavviso", async () => {
    const prisma = { quote: { findUnique: vi.fn().mockResolvedValue(quote(false)) } };
    const service = new QuotePdfService(prisma as never, {} as never);
    const text = textOf((await service.forUser("c1", "q1")).model);
    expect(text).toContain("Avvisa almeno 24 ore prima.");
    expect(text).not.toContain("non è rimborsabile");
    expect(text).toContain("l'acconto ti torna sempre");
  });
});
