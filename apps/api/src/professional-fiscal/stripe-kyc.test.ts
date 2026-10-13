import { afterEach, describe, expect, it } from "vitest";
import { describePaymentOffer, jobPaymentAdminLabel, paymentOfferChanged, quoteChangeWhat } from "@professionisti/shared";
import { stripeKycMissing, stripeKycWhere } from "./stripe-kyc";

/**
 * Profilo pubblico solo dopo la verifica su Stripe (docs/CHANGELOG.md §236)
 * e piccole migliorie sui modi di pagamento del preventivo.
 */
describe("verifica su Stripe per essere visibili", () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("senza pagamenti attivi sull'ambiente non nasconde nessuno", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeKycWhere()).toEqual({});
    expect(stripeKycMissing({ isDemo: false, fiscalProfile: null })).toBe(false);
  });

  it("con i pagamenti attivi serve l'account Stripe attivo, tranne per i profili dimostrativi", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    expect(stripeKycWhere()).toEqual({ OR: [{ isDemo: true }, { fiscalProfile: { is: { stripePayoutsEnabled: true } } }] });
    expect(stripeKycMissing({ isDemo: false, fiscalProfile: null })).toBe(true);
    expect(stripeKycMissing({ isDemo: false, fiscalProfile: { stripePayoutsEnabled: false } })).toBe(true);
    expect(stripeKycMissing({ isDemo: false, fiscalProfile: { stripePayoutsEnabled: true } })).toBe(false);
    expect(stripeKycMissing({ isDemo: true, fiscalProfile: null })).toBe(false);
  });
});

describe("modi di pagamento: testi e confronti", () => {
  it("descrive l'offerta con la percentuale solo se c'è un modo online", () => {
    expect(describePaymentOffer({ paymentOptions: ["DIRECT"], depositPercent: 20 })).toBe("tutto diretto (contanti, bonifico...)");
    expect(describePaymentOffer({ paymentOptions: ["MIXED"], depositPercent: 30 })).toBe("acconto online e saldo diretto (acconto online 30%)");
  });

  it("la percentuale conta solo con un modo online", () => {
    expect(paymentOfferChanged({ paymentOptions: ["DIRECT"], depositPercent: 20 }, { paymentOptions: ["DIRECT"], depositPercent: 50 })).toBe(false);
    expect(paymentOfferChanged({ paymentOptions: ["ONLINE"], depositPercent: 20 }, { paymentOptions: ["ONLINE"], depositPercent: 50 })).toBe(true);
  });

  it("elenca cosa è cambiato nel preventivo", () => {
    expect(quoteChangeWhat({ itemsChanged: false, notesChanged: false, paymentChanged: true })).toBe("i modi di pagamento");
    expect(quoteChangeWhat({ itemsChanged: true, notesChanged: true, paymentChanged: true })).toBe("le voci, le note e i modi di pagamento");
    expect(quoteChangeWhat({ itemsChanged: false, notesChanged: false })).toBeNull();
  });

  it("riga admin per il saldo diretto", () => {
    expect(jobPaymentAdminLabel(null)).toBe("Pagamento diretto al professionista");
    expect(
      jobPaymentAdminLabel({
        method: "ONLINE",
        balanceDirect: true,
        directBalanceEurCents: 40000,
        stage: "RELEASED",
        depositEurCents: 10000,
        paidEurCents: 10000,
        refundedEurCents: 0,
        finalAmountEurCents: 50000,
        balanceDueEurCents: 0,
        releaseDueAt: null,
        releasedAt: null,
        balanceUnpaid: false,
      }),
    ).toBe("Acconto online e saldo diretto: pagato online €100, pagamento passato al professionista; saldo diretto €400");
  });
});
