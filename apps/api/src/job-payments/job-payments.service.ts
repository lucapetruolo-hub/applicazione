import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformFeeRulesService } from "../platform-fee-rules/platform-fee-rules.service";
import {
  onlineDepositEurCents,
  onlineTargetEurCents,
  paymentChoiceIsOnline,
  professionalPayoutTotals,
  toJobPaymentSummary,
  type JobPaymentChoice,
  type ProfessionalPayoutTotals,
} from "@professionisti/shared";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Pagamento del lavoro (JobPayment) — CLAUDE.md §88, docs/CHANGELOG.md §168.
 * Distinto da BillingService (pagamenti del PROFESSIONISTA verso Manovia:
 * abbonamento, boost). Il cliente sceglie il metodo accettando il
 * preventivo: online (MANOVIA: acconto subito, saldo a lavoro chiuso, soldi
 * bloccati sul conto Stripe del professionista e sbloccati alla conferma,
 * meno costo Stripe e commissione, vedi OnlineMoneyService) o diretto (DIRECT:
 * importo dichiarato dal professionista a lavoro chiuso e confermato dal
 * cliente, nessun movimento sul sito). Prenotazioni senza scelta (es.
 * dall'agenda) restano DIRECT.
 */
@Injectable()
export class JobPaymentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly feeRulesService: PlatformFeeRulesService,
    private readonly onlineMoneyService: OnlineMoneyService,
  ) {}

  /**
   * Metodo di pagamento scelto dal cliente accettando il preventivo
   * (docs/CHANGELOG.md §168). Online: acconto del 20% dell'importo massimo
   * da pagare subito con Stripe. Diretto: nessun movimento sul sito, il
   * pagamento si conferma a lavoro terminato come prima.
   */
  async createAtAcceptance(params: {
    bookingId: string;
    choice: JobPaymentChoice;
    /** Percentuale dell'acconto online scelta dal professionista nel preventivo (§237). */
    depositPercent?: number;
    quoteMaxEurCents: number;
    clientUserId: string;
  }): Promise<void> {
    const existing = await this.prisma.jobPayment.findUnique({ where: { bookingId: params.bookingId } });
    if (existing) return;
    const online = paymentChoiceIsOnline(params.choice);
    const balanceDirect = params.choice === "MIXED";
    const jobPayment = await this.prisma.jobPayment.create({
      data: {
        bookingId: params.bookingId,
        paymentMethod: online ? "MANOVIA" : "DIRECT",
        status: "PENDING",
        grossAmountEurCents: params.quoteMaxEurCents,
        platformFeeEurCents: 0,
        netAmountEurCents: params.quoteMaxEurCents,
        ...(online
          ? { onlineStage: "AWAITING_DEPOSIT", depositEurCents: onlineDepositEurCents(params.quoteMaxEurCents, params.depositPercent), balanceDirect }
          : {}),
      },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPayment.id,
      newValue: { paymentMethod: jobPayment.paymentMethod, depositEurCents: jobPayment.depositEurCents, balanceDirect },
      changedByUserId: params.clientUserId,
      reason: !online
        ? "Il cliente ha scelto il pagamento diretto al professionista."
        : balanceDirect
          ? "Il cliente ha scelto l'acconto online e il saldo diretto al professionista."
          : "Il cliente ha scelto il pagamento online (acconto + saldo).",
    });
  }

  /**
   * Chiusura del lavoro con l'importo finale (BookingsService.
   * completeWithFinalAmount). Online: commissione sull'importo finale,
   * saldo da pagare e data di accredito al professionista. Diretto (o
   * prenotazioni senza scelta, es. dall'agenda): pagamento dichiarato dal
   * professionista, da confermare dal cliente.
   */
  async createOnCompletion(params: {
    bookingId: string;
    grossAmountEurCents: number;
    reportedByUserId: string;
    // Vero se il cliente ha già confermato "lavoro terminato" dal proprio
    // lato PRIMA che il professionista completasse (ordine libero, CLAUDE.md
    // §40) — il pagamento diretto nasce già CONFIRMED.
    alreadyConfirmedByClient?: boolean;
    /** Importo finale dentro il preventivo accettato: il saldo si può addebitare sulla carta salvata (§267). */
    autoChargeBalance?: boolean;
  }): Promise<{ balanceDueEurCents: number; autoChargedEurCents: number } | null> {
    const existing = await this.prisma.jobPayment.findUnique({ where: { bookingId: params.bookingId }, include: { booking: true } });

    if (existing?.paymentMethod === "MANOVIA") {
      const rule = await this.feeRulesService.resolveRule({ professionalProfileId: existing.booking.professionalProfileId, categoryId: null });
      // Col saldo diretto la commissione vale solo sulla parte pagata online (§237).
      const appFee = this.feeRulesService.computeFee(onlineTargetEurCents(params.grossAmountEurCents, existing), rule);
      if (rule) await this.prisma.jobPayment.update({ where: { id: existing.id }, data: { appliedFeeRuleId: rule.id } });
      const result = await this.onlineMoneyService.afterCompletion(existing.id, params.grossAmountEurCents, appFee, { autoCharge: params.autoChargeBalance });
      if (params.alreadyConfirmedByClient) await this.onlineMoneyService.releaseIfDue(existing.id).catch(() => false);
      return result;
    }

    const directData = {
      paymentMethod: "DIRECT" as const,
      status: params.alreadyConfirmedByClient ? ("CONFIRMED" as const) : ("AWAITING_CONFIRMATION" as const),
      grossAmountEurCents: params.grossAmountEurCents,
      platformFeeEurCents: 0,
      netAmountEurCents: params.grossAmountEurCents,
      directReportedAt: new Date(),
      directReportedById: params.reportedByUserId,
      directConfirmedAt: params.alreadyConfirmedByClient ? new Date() : null,
    };
    const jobPayment = existing
      ? await this.prisma.jobPayment.update({ where: { id: existing.id }, data: directData })
      : await this.prisma.jobPayment.create({ data: { bookingId: params.bookingId, ...directData } });

    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPayment.id,
      newValue: { paymentMethod: "DIRECT", grossAmountEurCents: params.grossAmountEurCents },
      changedByUserId: params.reportedByUserId,
      reason: "Importo finale dichiarato dal professionista a lavoro terminato (pagamento diretto).",
    });
    return null;
  }

  /** Solo il cliente e il professionista della prenotazione (controllo sicurezza, docs/CHANGELOG.md §290). */
  async getForBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { clientId: true, professionalProfile: { select: { userId: true } } },
    });
    if (!booking || (booking.clientId !== userId && booking.professionalProfile.userId !== userId)) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    return this.prisma.jobPayment.findUnique({ where: { bookingId } });
  }

  /**
   * Il cliente conferma il lavoro (BookingsService.clientConfirmComplete):
   * col pagamento diretto vale come conferma di aver pagato; online fa
   * partire l'accredito al professionista se il saldo è pagato.
   */
  async confirmDirect(bookingId: string, clientUserId: string): Promise<void> {
    const jobPayment = await this.prisma.jobPayment.findUnique({ where: { bookingId } });
    if (jobPayment?.paymentMethod === "MANOVIA") {
      // Mai bloccare la conferma del cliente: se l'accredito non riesce ora, lo riprova il giro orario.
      await this.onlineMoneyService.releaseIfDue(jobPayment.id).catch(() => false);
      return;
    }
    if (!jobPayment || jobPayment.paymentMethod !== "DIRECT" || jobPayment.status !== "AWAITING_CONFIRMATION") {
      return;
    }
    await this.prisma.jobPayment.update({
      where: { id: jobPayment.id },
      data: { status: "CONFIRMED", directConfirmedAt: new Date() },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPayment.id,
      fieldName: "status",
      oldValue: "AWAITING_CONFIRMATION",
      newValue: "CONFIRMED",
      changedByUserId: clientUserId,
      reason: "Il cliente ha confermato il pagamento diretto.",
    });
  }

  /** Checkout Stripe dell'acconto o del saldo (§168). */
  createCheckout(clientUserId: string, bookingId: string, part: "deposit" | "balance") {
    return this.onlineMoneyService.createCheckout(clientUserId, bookingId, part);
  }

  /** Checkout dell'acconto che conferma il lavoro all'accettazione del preventivo (§240). */
  createQuoteDepositCheckout(params: Parameters<OnlineMoneyService["createQuoteDepositCheckout"]>[0]) {
    return this.onlineMoneyService.createQuoteDepositCheckout(params);
  }

  /** Acconto del preventivo pagato: lo registra sul pagamento del lavoro appena creato, senza un secondo avviso. */
  recordQuoteDeposit(jobPaymentId: string, session: Stripe.Checkout.Session): Promise<void> {
    return this.onlineMoneyService.recordCheckoutPayment(jobPaymentId, "deposit", session, { notify: false });
  }

  refundQuoteDeposit(
    paymentIntentId: string,
    reason: string,
    stripeAccount?: string | null,
    notifyTo?: { clientUserId: string; guidedRequestId: string | null },
  ): Promise<{ pending: boolean }> {
    return this.onlineMoneyService.refundQuoteDeposit(paymentIntentId, reason, stripeAccount, notifyTo);
  }

  /** Gestito dallo stesso webhook Stripe già in uso per BillingService (CLAUDE.md §9). */
  handleManoviaCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    return this.onlineMoneyService.handleCheckoutCompleted(session);
  }

  /** Contestazione in banca (`charge.dispute.*`): false se il pagamento non è di un lavoro. */
  handleStripeDispute(dispute: Stripe.Dispute): Promise<boolean> {
    return this.onlineMoneyService.handleStripeDispute(dispute);
  }

  /** Soldi di una contestazione tolti o restituiti dalla banca (`charge.dispute.funds_*`, §267). */
  handleRefundUpdated(refund: Stripe.Refund, stripeAccount: string | null | undefined): Promise<void> {
    return this.onlineMoneyService.handleRefundUpdated(refund, stripeAccount);
  }

  handleStripeDisputeFunds(dispute: Stripe.Dispute, kind: "withdrawn" | "reinstated"): Promise<boolean> {
    return this.onlineMoneyService.handleStripeDisputeFunds(dispute, kind);
  }

  /** Saldo addebitato sulla carta salvata (`payment_intent.succeeded`, §267). */
  handleAutoBalanceSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
    return this.onlineMoneyService.handleAutoBalanceSucceeded(intent);
  }

  /** Bonifico dal conto Stripe del professionista arrivato o non riuscito (§249). */
  handlePayoutEvent(payout: Stripe.Payout): Promise<void> {
    return this.onlineMoneyService.handlePayoutEvent(payout);
  }

  /** Conto Stripe del professionista aggiornato: riprova i bonifici in sospeso (§249). */
  retryPayoutsForAccount(accountId: string, options: { skipFailed?: boolean } = {}): Promise<void> {
    return this.onlineMoneyService.retryPayoutsForAccount(accountId, options);
  }

  /** Avviso agli admin Finanza per un evento Stripe che non riguarda un lavoro. */
  notifyFinanceAdmins(type: string, payload: Record<string, unknown>): Promise<void> {
    return this.onlineMoneyService.notifyFinanceAdmins(type, payload);
  }

  /**
   * Annullamento di un lavoro pagato online (dal cliente o dal
   * professionista): l'acconto torna al cliente per intero.
   */
  async refundOnCancel(bookingId: string, byUserId: string): Promise<void> {
    const jp = await this.prisma.jobPayment.findUnique({ where: { bookingId } });
    if (!jp || jp.paymentMethod !== "MANOVIA" || jp.paidEurCents - jp.refundedEurCents <= 0) return;
    try {
      await this.onlineMoneyService.refundOnline(jp.id, "ALL", "Lavoro annullato: acconto rimborsato al cliente.", byUserId);
    } catch {
      // Stripe non raggiungibile: l'annullamento non si blocca, il rimborso
      // passa alla Finanza in "Pagamenti e rimborsi".
      const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { clientId: true } });
      await this.prisma.refund.create({
        data: {
          jobPaymentId: jp.id,
          amountEurCents: jp.paidEurCents - jp.refundedEurCents,
          reason: "Lavoro annullato: rimborso dell'acconto (automatico non riuscito).",
          requestedById: booking.clientId,
        },
      });
    }
  }

  async listAll() {
    return this.prisma.jobPayment.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { booking: { include: { professionalProfile: { select: { businessName: true } } } } },
    });
  }

  /**
   * Riepilogo finanza per /admin (CLAUDE.md §88) — ricavo reale di Manovia
   * per fonte (ManoviaRevenue, mai confuso col denaro che transita per un
   * JobPayment, che nella maggior parte va al professionista) più i
   * conteggi di JobPayment per metodo/stato, utili a colpo d'occhio.
   */
  async financeSummary() {
    const [revenueBySource, jobPaymentsByMethod, jobPaymentsByStatus] = await Promise.all([
      this.prisma.manoviaRevenue.groupBy({ by: ["source"], _sum: { amountEurCents: true } }),
      this.prisma.jobPayment.groupBy({ by: ["paymentMethod"], _count: { _all: true }, _sum: { grossAmountEurCents: true } }),
      this.prisma.jobPayment.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    return {
      revenueBySource: revenueBySource.map((r) => ({ source: r.source, totalEurCents: r._sum.amountEurCents ?? 0 })),
      jobPaymentsByMethod: jobPaymentsByMethod.map((r) => ({
        method: r.paymentMethod,
        count: r._count._all,
        totalGrossEurCents: r._sum.grossAmountEurCents ?? 0,
      })),
      jobPaymentsByStatus: jobPaymentsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    };
  }

  /**
   * Riepilogo dei pagamenti online del professionista per stato del bonifico
   * (bloccati, in preparazione, in arrivo, arrivati in banca), in Dati fiscali
   * e pagamenti (docs/CHANGELOG.md §249).
   */
  async professionalPayoutSummary(userId: string): Promise<ProfessionalPayoutTotals> {
    const bookings = await this.prisma.booking.findMany({
      where: { professionalProfile: { userId }, jobPayment: { paymentMethod: "MANOVIA" } },
      select: { finalAmountEurCents: true, jobPayment: true },
    });
    return professionalPayoutTotals(
      bookings.map((booking) => {
        const summary = toJobPaymentSummary(booking.jobPayment, booking.finalAmountEurCents, true);
        // Vecchio modello (trasferimento allo sblocco): Stripe ha già pagato da solo.
        if (summary && booking.jobPayment?.releasedAt && !booking.jobPayment.stripeDestinationAccountId && summary.payoutStatus === "SENT") {
          summary.payoutStatus = "PAID";
        }
        return summary;
      }),
    );
  }
}
