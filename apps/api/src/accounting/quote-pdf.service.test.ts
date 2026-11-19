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
  // Ora fissa, lontana dall'appuntamento del 20/11: prima la prova dipendeva dal giorno in cui girava.
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_finta");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("con l'acconto trattenuto dice fino a quando si annulla gratis e che dopo non è rimborsabile", async () => {
    const prisma = { quote: { findUnique: vi.fn().mockResolvedValue(quote(true)) } };
    const service = new QuotePdfService(prisma as never, {} as never);
    const { model } = await service.forUser("c1", "q1");
    expect(textOf(model)).toContain("Pagando online: annullamento gratuito fino a giovedì 19 novembre alle 08:00. Dopo, l'acconto di 16,00 € non è rimborsabile.");
  });

  // Dentro il preavviso la data "fino a…" sarebbe già passata
  // (docs/changelog/2026-11-13-annullare-data-passata.md).
  it("dentro il preavviso non dà una data già passata", async () => {
    vi.setSystemTime(new Date("2026-11-19T12:00:00.000Z"));
    const prisma = { quote: { findUnique: vi.fn().mockResolvedValue(quote(true)) } };
    const service = new QuotePdfService(prisma as never, {} as never);
    const text = textOf((await service.forUser("c1", "q1")).model);
    expect(text).toContain("Mancano meno di 24 ore all'appuntamento.");
    expect(text).toContain("Pagando online, l'acconto di 16,00 € non è rimborsabile, anche se annulli.");
    expect(text).not.toContain("annullamento gratuito fino a");
  });

  it("senza acconto trattenuto resta solo il preavviso", async () => {
    const prisma = { quote: { findUnique: vi.fn().mockResolvedValue(quote(false)) } };
    const service = new QuotePdfService(prisma as never, {} as never);
    const text = textOf((await service.forUser("c1", "q1")).model);
    expect(text).toContain("Avvisa almeno 24 ore prima.");
    expect(text).not.toContain("non è rimborsabile");
    expect(text).toContain("Pagando online, se annulli prima dell'appuntamento, l'acconto di 16,00 € ti torna sempre sulla carta.");
  });
});

describe("PDF del riepilogo dei pagamenti per il cliente", () => {
  it("dice quale lavoro e mette il rimborso col segno meno", async () => {
    const prisma = {
      booking: { findUniqueOrThrow: vi.fn().mockResolvedValue({ scheduledAt: new Date("2026-11-20T08:00:00Z"), professionalProfile: { businessName: "Idraulica Prova" }, quote: { guidedRequest: { category: { label: "Idraulico" } } } }) },
    };
    const jobDocuments = {
      forUser: vi.fn().mockResolvedValue({
        audience: "CLIENT",
        movements: [
          { date: "2026-11-09T18:00:00Z", label: "Acconto pagato online", amountEurCents: -3100 },
          { date: "2026-11-22T12:00:00Z", label: "Rimborso ricevuto", amountEurCents: 1500 },
        ],
      }),
    };
    const { model } = await new QuotePdfService(prisma as never, jobDocuments as never).paymentsForClient("c1", "b1");
    const text = textOf(model);
    expect(model.subtitle).toBe("Idraulica Prova. Idraulico, appuntamento del 20 novembre 2026.");
    expect(text).toContain("−15,00 €");
    expect(text).toContain('"value":"31,00 €"');
    expect(text).toContain("16,00 €");
  });
});
