import { Inject, Injectable } from "@nestjs/common";
import type Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformFeeRulesService } from "../platform-fee-rules/platform-fee-rules.service";
import { onlineDepositEurCents, type JobPaymentChoice } from "@professionisti/shared";
import { OnlineMoneyService } from "./online-money.service";

/**
 * Pagamento del lavoro (JobPayment) — CLAUDE.md §88, docs/CHANGELOG.md §168.
 * Distinto da BillingService (pagamenti del PROFESSIONISTA verso Manovia:
 * abbonamento, boost). Il cliente sceglie il metodo accettando il
 * preventivo: online (MANOVIA: acconto del 20% subito, saldo a lavoro
 * chiuso, soldi in custodia e poi accreditati al professionista meno costo
 * Stripe e commissione, vedi OnlineMoneyService) o diretto (DIRECT:
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
  async createAtAcceptance(params: { bookingId: string; choice: JobPaymentChoice; quoteMaxEurCents: number; clientUserId: string }): Promise<void> {
    const existing = await this.prisma.jobPayment.findUnique({ where: { bookingId: params.bookingId } });
    if (existing) return;
    const online = params.choice === "ONLINE";
    const jobPayment = await this.prisma.jobPayment.create({
      data: {
        bookingId: params.bookingId,
        paymentMethod: online ? "MANOVIA" : "DIRECT",
        status: "PENDING",
        grossAmountEurCents: params.quoteMaxEurCents,
        platformFeeEurCents: 0,
        netAmountEurCents: params.quoteMaxEurCents,
        ...(online ? { onlineStage: "AWAITING_DEPOSIT", depositEurCents: onlineDepositEurCents(params.quoteMaxEurCents) } : {}),
      },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPayment.id,
      newValue: { paymentMethod: jobPayment.paymentMethod, depositEurCents: jobPayment.depositEurCents },
      changedByUserId: params.clientUserId,
      reason: online ? "Il cliente ha scelto il pagamento online (acconto + saldo)." : "Il cliente ha scelto il pagamento diretto al professionista.",
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
  }): Promise<{ balanceDueEurCents: number } | null> {
    const existing = await this.prisma.jobPayment.findUnique({ where: { bookingId: params.bookingId }, include: { booking: true } });

    if (existing?.paymentMethod === "MANOVIA") {
      const rule = await this.feeRulesService.resolveRule({ professionalProfileId: existing.booking.professionalProfileId, categoryId: null });
      const appFee = this.feeRulesService.computeFee(params.grossAmountEurCents, rule);
      if (rule) await this.prisma.jobPayment.update({ where: { id: existing.id }, data: { appliedFeeRuleId: rule.id } });
      const result = await this.onlineMoneyService.afterCompletion(existing.id, params.grossAmountEurCents, appFee);
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

  async getForBooking(bookingId: string) {
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

  /** Gestito dallo stesso webhook Stripe già in uso per BillingService (CLAUDE.md §9). */
  handleManoviaCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    return this.onlineMoneyService.handleCheckoutCompleted(session);
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
}
