import { describe, expect, it, vi } from "vitest";
import { formatEurCents, statementCsv, statementOnlineNote, toJobPaymentSummary } from "@professionisti/shared";
import { StatementsService } from "./statements.service";
import { CourtesyCopyService } from "./courtesy-copy.service";

/**
 * Estratto del mese con rimborsi, contestazioni in banca e soldi bloccati
 * (collaudo G-12, G-14, G-15): le cifre vengono da `toJobPaymentSummary`,
 * come la scheda del lavoro e "Pagamenti online".
 */
const oct = (day: number) => new Date(Date.UTC(2026, 9, day, 10));

const booking = (name: string) => ({
  finalAmountEurCents: null as number | null,
  scheduledAt: oct(1),
  recipientName: null,
  recipientSurname: null,
  client: { name, surname: null },
  courtesyDocument: null,
  quote: { invoiceRequest: null, guidedRequest: { description: "Lavoro", category: { label: "Idraulico" } } },
});

function payment(id: string, name: string, over: Record<string, unknown>) {
  return {
    id,
    paymentMethod: "MANOVIA",
    balanceDirect: false,
    onlineStage: "DEPOSIT_PAID",
    depositEurCents: null,
    paidEurCents: 0,
    refundedEurCents: 0,
    platformFeeEurCents: 0,
    stripeFeeEurCents: 0,
    netAmountEurCents: 0,
    releaseDueAt: null,
    releasedAt: null,
    balanceUnpaidAt: null,
    stripeDestinationAccountId: "acct_1",
    payoutPendingEurCents: 0,
    payoutSentEurCents: 0,
    payoutSentAt: null,
    payoutPaidAt: null,
    payoutFailedAt: null,
    stripeDisputeId: null,
    stripeDisputeStatus: null,
    stripeDisputedAt: null,
    stripeDisputeClosedAt: null,
    ...over,
    booking: booking(name),
  };
}

const hold = (jobPayment: ReturnType<typeof payment>, paid: number, fee: number, at: Date) => ({
  jobPaymentId: jobPayment.id,
  jobPayment,
  kind: "HOLD",
  grossEurCents: fee,
  taxableEurCents: Math.round(fee / 1.22),
  vatEurCents: fee - Math.round(fee / 1.22),
  paymentEurCents: paid,
  description: "Acconto online",
  occurredAt: at,
  invoice: null,
});

describe("estratto del mese: rimborsi, contestazioni e soldi bloccati", () => {
  const refunded = payment("f15", "Ugo", { onlineStage: "REFUNDED", paidEurCents: 4000, refundedEurCents: 4000, releasedAt: oct(12) });
  const disputed = payment("f22", "Paola", { paidEurCents: 8000, stripeDisputeId: "dp_1", stripeDisputeStatus: "needs_response", stripeDisputedAt: oct(20) });
  const blocked = payment("f13", "Bruno", { onlineStage: "PAID", paidEurCents: 38000 });
  const lost = payment("f30", "Lia", { onlineStage: "REFUNDED", paidEurCents: 5000, refundedEurCents: 5000, releasedAt: oct(25), stripeDisputeId: "dp_2", stripeDisputeStatus: "lost", stripeDisputedAt: oct(15), stripeDisputeClosedAt: oct(25) });
  blocked.booking.finalAmountEurCents = 38000;
  const online = [refunded, disputed, blocked, lost];

  function build() {
    const prisma = {
      platformFeeEntry: { findMany: vi.fn().mockResolvedValue([hold(refunded, 4000, 342, oct(10)), hold(disputed, 8000, 684, oct(11)), hold(blocked, 38000, 3245, oct(5)), hold(lost, 5000, 427, oct(9))]) },
      jobPayment: {
        findMany: vi.fn((args: { where: { paymentMethod?: string; payoutPaidAt?: unknown } }) =>
          Promise.resolve(args.where.paymentMethod === "MANOVIA" ? online : []),
        ),
      },
      invoice: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue({ entityType: "PRIVATE" }) },
      auditLog: { findMany: vi.fn().mockResolvedValue([{ entityId: "f15", oldValue: "0", newValue: "4000", createdAt: oct(12) }]) },
    };
    const invoices = { activeIssuer: vi.fn().mockResolvedValue(null) };
    return new StatementsService(prisma as never, {} as never, invoices as never, {} as never);
  }

  it("rimborso con la sua riga, contestazione fuori dai totali, bloccati come in Pagamenti online", async () => {
    const { statement, csvRows } = await build().build("pro-1", "2026-10");
    const row = (id: string) => statement.rows.find((r) => r.jobPaymentId === id)!;

    // G-12: il rimborso ha la sua riga e non è più "In arrivo sul tuo conto".
    expect(row("f15")).toMatchObject({ onlineEurCents: 4000, refundsEurCents: 4000, payoutNote: "Rimborsato al cliente" });
    expect(row("f30")).toMatchObject({ refundsEurCents: 5000, payoutNote: "Contestazione persa: soldi tornati al cliente" });
    const csv = statementCsv(csvRows);
    expect(csv).toContain("Rimborso al cliente;Idraulico, Lavoro;Ugo;-40,00");
    expect(csv).toContain("Contestazione in banca persa: soldi tornati al cliente;Idraulico, Lavoro;Lia;-50,00");

    // G-15: la contestazione aperta è scritta e resta fuori da "Pagato online" e dai bloccati.
    expect(row("f22")).toMatchObject({ disputed: true, payoutNote: "Contestato in banca: può tornare al cliente" });
    expect(csv).toContain("Contestazione in banca aperta: il pagamento può tornare al cliente");
    expect(statement.totals).toMatchObject({ onlineEurCents: 38000, refundsEurCents: 9000, disputedEurCents: 8000 });
    expect(statementOnlineNote(statement)).toContain("senza i rimborsi ai clienti");

    // G-14: la cifra bloccata è quella della scheda del lavoro e di "Pagamenti online".
    const summary = toJobPaymentSummary(blocked as never, 38000, true)!;
    expect(statement.blockedEurCents).toBe(summary.payoutEurCents);
    expect(row("f13").payoutNote).toBe(`Bloccati ${formatEurCents(summary.payoutEurCents!)}: partono quando il cliente conferma`);
  });
});

describe("lavori pagati online senza documento al cliente", () => {
  it("ricevuta per il lavoro occasionale, importo al netto dei rimborsi, niente lavori rimborsati del tutto", async () => {
    const bookingRow = (id: string, paid: number, refunded: number) => ({
      id,
      scheduledAt: new Date("2026-10-01T09:00:00Z"),
      professionalCompletedAt: new Date("2026-10-02T09:00:00Z"),
      recipientName: null,
      recipientSurname: null,
      jobPayment: { paymentMethod: "MANOVIA", balanceDirect: false, paidEurCents: paid, refundedEurCents: refunded, grossAmountEurCents: paid },
      client: { name: "Anna", surname: "Bianchi", deletedAt: null },
      quote: { invoiceRequest: null, guidedRequest: { category: { label: "Pulizie" } } },
      courtesyDocument: null,
    });
    const prisma = {
      professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue({ entityType: "PRIVATE_INDIVIDUAL" }) },
      booking: { findMany: vi.fn().mockResolvedValue([bookingRow("b1", 18000, 3000), bookingRow("b2", 5000, 5000)]) },
    };
    const invoices = { profileIdOf: vi.fn().mockResolvedValue("pro-1") };
    const service = new CourtesyCopyService(prisma as never, invoices as never, {} as never, {} as never);
    expect(await service.missingForProfessional("user-1")).toEqual([
      { bookingId: "b1", date: "2026-10-02T09:00:00.000Z", jobLabel: "Pulizie", customerName: "Anna Bianchi", amountEurCents: 15000, receipt: true },
    ]);
    const where = prisma.booking.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ professionalProfileId: "pro-1", status: "COMPLETED" });
  });
});
