import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformFeeRulesService } from "../platform-fee-rules/platform-fee-rules.service";

/**
 * Pagamento del lavoro (JobPayment) — CLAUDE.md §88. Distinto da
 * BillingService (che gestisce i pagamenti del PROFESSIONISTA verso
 * Manovia: abbonamento, lead, boost): questo modulo traccia il pagamento
 * del CLIENTE per il lavoro svolto, spezzato lordo/commissione/netto,
 * MANOVIA-mediato (Stripe Connect) o DIRETTO (fuori piattaforma,
 * commissione zero ma sempre tracciato).
 *
 * Creato automaticamente da BookingsService.completeWithFinalAmount (il
 * momento in cui l'importo lordo reale diventa noto, non prima — un
 * preventivo ha solo un range stimato) come DIRECT/AWAITING_CONFIRMATION:
 * è il default sempre disponibile, nessun professionista è mai bloccato da
 * Stripe Connect non ancora configurato. Passa a MANOVIA solo se il
 * cliente sceglie esplicitamente di pagare tramite la piattaforma
 * (initiateManoviaCheckout) e il professionista ha già completato
 * l'onboarding Stripe Connect.
 */
@Injectable()
export class JobPaymentsService {
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly feeRulesService: PlatformFeeRulesService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  private frontendUrl(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
  }

  /**
   * Creato al momento del completamento lavoro (BookingsService.
   * completeWithFinalAmount) — mai prima, coerente col resto del progetto
   * ("poco dato è meglio di un dato falso a zero", CLAUDE.md §15). Default
   * DIRECT: nessuna commissione trattenuta finché il cliente non sceglie
   * esplicitamente di pagare tramite Manovia.
   */
  async createOnCompletion(params: {
    bookingId: string;
    grossAmountEurCents: number;
    reportedByUserId: string;
    // Vero se il cliente ha già confermato "lavoro terminato" dal proprio
    // lato PRIMA che il professionista completasse (ordine libero, CLAUDE.md
    // §40: "il cliente deve poter cliccare a prescindere se il
    // professionista l'abbia già cliccato o no") — in quel caso non c'è più
    // nulla da confermare, il JobPayment nasce già CONFIRMED invece di
    // restare per sempre AWAITING_CONFIRMATION (confirmDirect non verrebbe
    // mai richiamato una seconda volta).
    alreadyConfirmedByClient?: boolean;
  }): Promise<void> {
    const existing = await this.prisma.jobPayment.findUnique({ where: { bookingId: params.bookingId } });
    if (existing) return; // idempotente — un secondo "Lavoro terminato" non deve mai duplicare il pagamento

    const jobPayment = await this.prisma.jobPayment.create({
      data: {
        bookingId: params.bookingId,
        paymentMethod: "DIRECT",
        status: params.alreadyConfirmedByClient ? "CONFIRMED" : "AWAITING_CONFIRMATION",
        grossAmountEurCents: params.grossAmountEurCents,
        platformFeeEurCents: 0,
        netAmountEurCents: params.grossAmountEurCents,
        directReportedAt: new Date(),
        directReportedById: params.reportedByUserId,
        directConfirmedAt: params.alreadyConfirmedByClient ? new Date() : null,
      },
    });

    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPayment.id,
      newValue: { paymentMethod: "DIRECT", grossAmountEurCents: params.grossAmountEurCents },
      changedByUserId: params.reportedByUserId,
      reason: "Creato al completamento del lavoro (auto-dichiarazione professionista).",
    });
  }

  async getForBooking(bookingId: string) {
    return this.prisma.jobPayment.findUnique({ where: { bookingId } });
  }

  /** Il cliente conferma un pagamento DIRECT — chiamato da BookingsService.clientConfirmComplete. */
  async confirmDirect(bookingId: string, clientUserId: string): Promise<void> {
    const jobPayment = await this.prisma.jobPayment.findUnique({ where: { bookingId } });
    if (!jobPayment || jobPayment.paymentMethod !== "DIRECT" || jobPayment.status !== "AWAITING_CONFIRMATION") {
      return; // nessun pagamento DIRECT in attesa — nulla da confermare (es. già passato a MANOVIA)
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

  /**
   * Il cliente sceglie di pagare tramite Manovia invece che direttamente al
   * professionista — richiede che il professionista abbia già completato
   * l'onboarding Stripe Connect (charges_enabled). Ricalcola la commissione
   * con la regola attiva ORA (non quella eventualmente già congelata, se
   * il JobPayment era ancora DIRECT/mai passato da un calcolo commissione
   * reale) e apre una Stripe Checkout Session in modalità "destination
   * charge": il cliente paga l'intero importo lordo, Stripe trasferisce il
   * netto al conto Connect del professionista trattenendo la commissione
   * per Manovia (`application_fee_amount`).
   */
  async initiateManoviaCheckout(clientUserId: string, bookingId: string) {
    if (!this.stripe) {
      throw new BadRequestException(
        "Il pagamento tramite Manovia non è ancora configurato su questo ambiente. Aggiungi STRIPE_SECRET_KEY per attivarlo.",
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: { include: { fiscalProfile: true } } },
    });
    if (!booking || booking.clientId !== clientUserId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }

    const jobPayment = await this.prisma.jobPayment.findUnique({ where: { bookingId } });
    if (!jobPayment) {
      throw new NotFoundException("Nessun pagamento associato a questo lavoro (il lavoro non risulta ancora terminato).");
    }
    if (jobPayment.status === "CONFIRMED" || jobPayment.status === "REFUNDED") {
      throw new BadRequestException("Questo pagamento è già stato concluso.");
    }

    const stripeAccountId = booking.professionalProfile.fiscalProfile?.stripeConnectAccountId;
    const chargesEnabled = booking.professionalProfile.fiscalProfile?.stripeChargesEnabled ?? false;
    if (!stripeAccountId || !chargesEnabled) {
      throw new BadRequestException(
        "Questo professionista non ha ancora completato l'attivazione dei pagamenti tramite Manovia. Puoi comunque pagarlo direttamente e confermarlo qui.",
      );
    }

    const rule = await this.feeRulesService.resolveRule({
      professionalProfileId: booking.professionalProfileId,
      categoryId: null,
    });
    const platformFeeEurCents = this.feeRulesService.computeFee(jobPayment.grossAmountEurCents, rule);
    const netAmountEurCents = jobPayment.grossAmountEurCents - platformFeeEurCents;

    const previousMethod = jobPayment.paymentMethod;
    await this.prisma.jobPayment.update({
      where: { id: jobPayment.id },
      data: {
        paymentMethod: "MANOVIA",
        status: "PENDING",
        platformFeeEurCents,
        netAmountEurCents,
        appliedFeeRuleId: rule?.id ?? null,
      },
    });
    if (previousMethod !== "MANOVIA") {
      await this.auditLogService.record({
        entityType: "JobPayment",
        entityId: jobPayment.id,
        fieldName: "paymentMethod",
        oldValue: previousMethod,
        newValue: "MANOVIA",
        changedByUserId: clientUserId,
        reason: "Il cliente ha scelto di pagare tramite Manovia invece che direttamente.",
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: jobPayment.grossAmountEurCents,
            product_data: { name: "Pagamento del lavoro tramite Manovia" },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeEurCents,
        transfer_data: { destination: stripeAccountId },
      },
      success_url: `${this.frontendUrl()}/le-mie-richieste?pagamento=completato`,
      cancel_url: `${this.frontendUrl()}/le-mie-richieste`,
      metadata: { kind: "job_payment", jobPaymentId: jobPayment.id, bookingId },
    });

    return { url: session.url };
  }

  /** Gestito dallo stesso webhook Stripe già in uso per BillingService (CLAUDE.md §9) — vedi BillingService.handleWebhookEvent. */
  async handleManoviaCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const jobPaymentId = session.metadata?.jobPaymentId;
    if (!jobPaymentId) return;

    const jobPayment = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId } });
    if (!jobPayment) return;

    await this.prisma.jobPayment.update({
      where: { id: jobPaymentId },
      data: {
        status: "CONFIRMED",
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      },
    });

    await this.prisma.manoviaRevenue.create({
      data: {
        source: "JOB_COMMISSION",
        amountEurCents: jobPayment.platformFeeEurCents,
        jobPaymentId: jobPayment.id,
        professionalProfileId: (await this.prisma.booking.findUnique({ where: { id: jobPayment.bookingId }, select: { professionalProfileId: true } }))
          ?.professionalProfileId,
      },
    });

    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPayment.id,
      fieldName: "status",
      oldValue: jobPayment.status,
      newValue: "CONFIRMED",
      reason: "Pagamento Stripe Connect confermato via webhook.",
    });
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
