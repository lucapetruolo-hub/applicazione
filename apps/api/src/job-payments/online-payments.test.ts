import { describe, expect, it } from "vitest";
import {
  acceptQuoteSchema,
  jobIssueCanEscalate,
  jobIssueAutoEscalation,
  onlineBalanceDueEurCents,
  onlineCanRelease,
  onlineDepositEurCents,
  onlinePayoutEurCents,
  toJobPaymentSummary,
} from "@professionisti/shared";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-10T10:00:00Z");

describe("pagamento online: acconto, saldo, accredito (§168)", () => {
  it("acconto del 20% dell'importo massimo del preventivo", () => {
    expect(onlineDepositEurCents(50000)).toBe(10000);
    expect(onlineDepositEurCents(12345)).toBe(2469);
  });
  it("saldo = importo finale meno quanto pagato, mai negativo", () => {
    expect(onlineBalanceDueEurCents(42000, 10000)).toBe(32000);
    expect(onlineBalanceDueEurCents(8000, 10000)).toBe(0);
  });
  it("al professionista il dovuto meno costo Stripe e commissione; l'eccesso torna al cliente", () => {
    expect(onlinePayoutEurCents({ finalAmountEurCents: 42000, paidEurCents: 42000, refundedEurCents: 0, stripeFeeEurCents: 700, appFeeEurCents: 2100 })).toEqual({
      payout: 39200,
      refundToClient: 0,
    });
    expect(onlinePayoutEurCents({ finalAmountEurCents: 8000, paidEurCents: 10000, refundedEurCents: 0, stripeFeeEurCents: 175, appFeeEurCents: 400 })).toEqual({
      payout: 7425,
      refundToClient: 2000,
    });
  });
  const base = { stage: "PAID" as const, professionalCompletedAt: new Date(now.getTime() - DAY), clientConfirmedAt: null, releaseDueAt: new Date(now.getTime() + 6 * DAY), issueOpen: false, now };
  it("accredito alla conferma del cliente, altrimenti dopo 7 giorni", () => {
    expect(onlineCanRelease(base)).toBe(false);
    expect(onlineCanRelease({ ...base, clientConfirmedAt: now })).toBe(true);
    expect(onlineCanRelease({ ...base, releaseDueAt: new Date(now.getTime() - 1) })).toBe(true);
  });
  it("con una segnalazione aperta i soldi restano fermi", () => {
    expect(onlineCanRelease({ ...base, clientConfirmedAt: now, issueOpen: true })).toBe(false);
  });
  it("saldo non pagato: niente accredito alla conferma, sì dopo 7 giorni", () => {
    expect(onlineCanRelease({ ...base, stage: "AWAITING_BALANCE", clientConfirmedAt: now })).toBe(false);
    expect(onlineCanRelease({ ...base, stage: "AWAITING_BALANCE", releaseDueAt: new Date(now.getTime() - 1) })).toBe(true);
  });
  it("il metodo di pagamento è diretto se non indicato", () => {
    expect(acceptQuoteSchema.parse({}).paymentMethod).toBe("DIRECT");
    expect(acceptQuoteSchema.parse({ paymentMethod: "ONLINE" }).paymentMethod).toBe("ONLINE");
  });
  it("riepilogo: il professionista vede commissione del 5% e quanto riceve", () => {
    const jp = {
      paymentMethod: "MANOVIA",
      onlineStage: "PAID",
      depositEurCents: 10000,
      paidEurCents: 42000,
      refundedEurCents: 0,
      platformFeeEurCents: 2100,
      stripeFeeEurCents: 700,
      netAmountEurCents: 0,
      releaseDueAt: now,
      releasedAt: null,
      balanceUnpaidAt: null,
    };
    const pro = toJobPaymentSummary(jp, 42000, true)!;
    expect(pro.method).toBe("ONLINE");
    expect(pro.payoutEurCents).toBe(39200);
    expect(toJobPaymentSummary(jp, 42000)!.payoutEurCents).toBeUndefined();
  });
});

describe("pagamento diretto: la segnalazione resta tra le parti (§168)", () => {
  const chat = { status: "CHAT", createdAt: new Date(now.getTime() - 3 * DAY), proRepliedAt: null, assisted: false };
  it("mai al nostro team da sola", () => {
    expect(jobIssueAutoEscalation(chat, now)).toBeNull();
  });
  it("il cliente può chiuderla in qualunque momento", () => {
    expect(jobIssueCanEscalate({ ...chat, createdAt: now }, now)).toBe(true);
  });
});
