import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import {
  ONLINE_APP_FEE_PERCENT,
  ONLINE_RELEASE_DAYS,
  onlineBalanceDueEurCents,
  onlineCanRelease,
  onlinePayoutEurCents,
  type JobPaymentOnlineStage,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_ISSUE_STATUSES = ["CHAT", "OPEN"];

/**
 * Soldi dei pagamenti online dei lavori (docs/CHANGELOG.md §168): acconto e
 * saldo pagati dal cliente a Manovia con Stripe Checkout ("separate charges
 * and transfers" di Stripe Connect), custodia finché il cliente non conferma
 * il lavoro o per 7 giorni dalla chiusura, poi trasferimento al conto Stripe
 * del professionista meno costo Stripe e commissione; rimborsi al cliente
 * (annullamenti, segnalazioni accolte, differenza pagata in più).
 *
 * Modulo a parte, senza dipendenze da area admin o regole di commissione:
 * lo usano sia i pagamenti sia le segnalazioni, senza dipendenze circolari.
 * La commissione arriva già calcolata in `JobPayment.platformFeeEurCents`.
 */
@Injectable()
export class OnlineMoneyService {
  private readonly logger = new Logger(OnlineMoneyService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException("Il pagamento online non è disponibile in questo momento. Riprova più tardi o scegli il pagamento diretto.");
    }
    return this.stripe;
  }

  private frontendUrl(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
  }

  /** Checkout Stripe per l'acconto o il saldo di un lavoro pagato online. */
  async createCheckout(clientUserId: string, bookingId: string, part: "deposit" | "balance"): Promise<{ url: string | null }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { jobPayment: true, quote: { select: { guidedRequestId: true } }, professionalProfile: { select: { businessName: true } } },
    });
    if (!booking || booking.clientId !== clientUserId) throw new ForbiddenException("Questa prenotazione non è tua.");
    const jp = booking.jobPayment;
    if (!jp || jp.paymentMethod !== "MANOVIA") throw new BadRequestException("Per questo lavoro hai scelto il pagamento diretto al professionista.");
    if (booking.status === "CANCELED") throw new BadRequestException("Il lavoro è stato annullato.");

    let amount: number;
    if (part === "deposit") {
      if (jp.onlineStage !== "AWAITING_DEPOSIT" || !jp.depositEurCents) throw new BadRequestException("L'acconto risulta già pagato.");
      amount = jp.depositEurCents;
    } else {
      if (booking.finalAmountEurCents === null) throw new BadRequestException("Il saldo si paga quando il professionista chiude il lavoro con l'importo finale.");
      amount = onlineBalanceDueEurCents(booking.finalAmountEurCents, jp.paidEurCents - jp.refundedEurCents);
      // Dopo l'accredito il saldo si può ancora pagare se era rimasto scoperto (§168).
      const closed = jp.onlineStage === "REFUNDED" || (jp.onlineStage === "RELEASED" && !jp.balanceUnpaidAt);
      if (amount <= 0 || closed) throw new BadRequestException("Non c'è nessun saldo da pagare.");
    }

    const back = booking.quote
      ? `${this.frontendUrl()}/le-mie-richieste?tab=lavori&open=${booking.quote.guidedRequestId}`
      : `${this.frontendUrl()}/le-mie-richieste?tab=lavori`;
    const session = await this.requireStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: {
              name: `${part === "deposit" ? "Acconto" : "Saldo"} del lavoro con ${booking.professionalProfile.businessName}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: { transfer_group: bookingId, metadata: { kind: "job_payment", part, jobPaymentId: jp.id, bookingId } },
      success_url: `${back}&pagamento=completato`,
      cancel_url: back,
      metadata: { kind: "job_payment", part, jobPaymentId: jp.id, bookingId },
    });
    return { url: session.url };
  }

  /** Webhook `checkout.session.completed` di un acconto o saldo. Idempotente sul payment intent. */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const jobPaymentId = session.metadata?.jobPaymentId;
    const part = session.metadata?.part === "balance" ? "balance" : "deposit";
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!jobPaymentId || !paymentIntentId) return;
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId }, include: { booking: true } });
    if (!jp) return;
    if (jp.stripePaymentIntentId === paymentIntentId || jp.balancePaymentIntentId === paymentIntentId) return;

    const amount = session.amount_total ?? 0;
    const stripeFee = await this.stripeFeeOf(paymentIntentId);

    // Saldo pagato in ritardo, dopo che l'acconto era già passato al
    // professionista: gli giriamo subito anche questa parte.
    if (part === "balance" && jp.releasedAt && jp.balanceUnpaidAt) {
      await this.settleLateBalance(jp.id, paymentIntentId, amount, stripeFee);
      return;
    }
    const paid = jp.paidEurCents + amount;
    const final = jp.booking.finalAmountEurCents;
    let stage: JobPaymentOnlineStage;
    if (final === null) stage = "DEPOSIT_PAID";
    else stage = onlineBalanceDueEurCents(final, paid - jp.refundedEurCents) > 0 ? "AWAITING_BALANCE" : "PAID";

    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        paidEurCents: paid,
        stripeFeeEurCents: jp.stripeFeeEurCents + stripeFee,
        onlineStage: stage,
        status: "PENDING",
        ...(part === "deposit" ? { stripePaymentIntentId: paymentIntentId, depositPaidAt: new Date() } : { balancePaymentIntentId: paymentIntentId, balancePaidAt: new Date() }),
      },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: part === "deposit" ? "depositPaidAt" : "balancePaidAt",
      newValue: { amountEurCents: amount, stripeFeeEurCents: stripeFee, stage },
      reason: `${part === "deposit" ? "Acconto" : "Saldo"} pagato online (Stripe).`,
    });
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: jp.booking.professionalProfileId }, select: { userId: true } });
    const quote = jp.booking.quoteId ? await this.prisma.quote.findUnique({ where: { id: jp.booking.quoteId }, select: { guidedRequestId: true } }) : null;
    if (pro) {
      await this.notificationsService.notify(pro.userId, part === "deposit" ? "JOB_DEPOSIT_PAID" : "JOB_BALANCE_PAID", {
        bookingId: jp.bookingId,
        guidedRequestId: quote?.guidedRequestId ?? null,
        amountEurCents: amount,
      });
    }
    if (stage === "PAID") await this.releaseIfDue(jp.id);
  }

  private async settleLateBalance(jobPaymentId: string, paymentIntentId: string, amount: number, stripeFee: number): Promise<void> {
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({
      where: { id: jobPaymentId },
      include: {
        booking: {
          include: {
            professionalProfile: { select: { id: true, userId: true, fiscalProfile: { select: { stripeConnectAccountId: true } } } },
            quote: { select: { guidedRequestId: true } },
          },
        },
      },
    });
    const appFee = Math.round((amount * ONLINE_APP_FEE_PERCENT) / 100);
    const payout = Math.max(0, amount - appFee - stripeFee);
    const destination = jp.booking.professionalProfile.fiscalProfile?.stripeConnectAccountId;
    const transfer =
      payout > 0 && destination
        ? await this.requireStripe().transfers.create(
            { amount: payout, currency: "eur", destination, transfer_group: jp.bookingId },
            { idempotencyKey: `job-late-balance-${paymentIntentId}` },
          )
        : null;
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        balancePaymentIntentId: paymentIntentId,
        balancePaidAt: new Date(),
        paidEurCents: { increment: amount },
        stripeFeeEurCents: { increment: stripeFee },
        platformFeeEurCents: { increment: appFee },
        netAmountEurCents: { increment: payout },
        balanceUnpaidAt: null,
      },
    });
    await this.prisma.manoviaRevenue.create({
      data: { source: "JOB_COMMISSION", amountEurCents: appFee, jobPaymentId: jp.id, professionalProfileId: jp.booking.professionalProfile.id },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "balancePaidAt",
      newValue: { amountEurCents: amount, payout, transferId: transfer?.id ?? null },
      reason: "Saldo pagato in ritardo e girato al professionista.",
    });
    await this.notificationsService.notify(jp.booking.professionalProfile.userId, "JOB_PAYOUT_SENT", {
      bookingId: jp.bookingId,
      guidedRequestId: jp.booking.quote?.guidedRequestId ?? null,
      amountEurCents: payout,
    });
  }

  /** Il nostro team chiude un saldo scoperto (pagato fuori piattaforma, rinuncia, ecc.). */
  async closeUnpaidBalance(adminUserId: string, jobPaymentId: string, note: string): Promise<void> {
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId } });
    if (!jp?.balanceUnpaidAt) throw new NotFoundException("Nessun saldo scoperto su questo pagamento.");
    await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { balanceUnpaidAt: null } });
    await this.auditLogService.record({ entityType: "JobPayment", entityId: jp.id, fieldName: "balanceUnpaidAt", oldValue: jp.balanceUnpaidAt, newValue: null, changedByUserId: adminUserId, reason: note });
  }

  /** Saldi non pagati entro 7 giorni, per la Finanza. */
  async listUnpaidBalances() {
    const rows = await this.prisma.jobPayment.findMany({
      where: { balanceUnpaidAt: { not: null } },
      orderBy: { balanceUnpaidAt: "asc" },
      include: {
        booking: {
          include: {
            client: { select: { id: true, name: true, surname: true, email: true } },
            professionalProfile: { select: { businessName: true, userId: true } },
          },
        },
      },
    });
    return rows.map((jp) => ({
      jobPaymentId: jp.id,
      bookingId: jp.bookingId,
      balanceUnpaidAt: jp.balanceUnpaidAt!.toISOString(),
      finalAmountEurCents: jp.booking.finalAmountEurCents,
      paidEurCents: jp.paidEurCents - jp.refundedEurCents,
      dueEurCents: onlineBalanceDueEurCents(jp.booking.finalAmountEurCents ?? 0, jp.paidEurCents - jp.refundedEurCents),
      client: {
        userId: jp.booking.client.id,
        name: [jp.booking.client.name, jp.booking.client.surname].filter(Boolean).join(" ") || null,
        email: jp.booking.client.email,
      },
      professional: { userId: jp.booking.professionalProfile.userId, businessName: jp.booking.professionalProfile.businessName },
    }));
  }

  /** Costo Stripe reale del pagamento (dalla balance transaction), 0 se non disponibile. */
  private async stripeFeeOf(paymentIntentId: string): Promise<number> {
    if (!this.stripe) return 0;
    try {
      const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
      return bt?.fee ?? 0;
    } catch (err) {
      this.logger.warn(`Costo Stripe non letto per ${paymentIntentId}: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Dopo la chiusura del lavoro (importo finale noto): fase del saldo e data
   * in cui i soldi passano al professionista se il cliente non conferma.
   */
  async afterCompletion(jobPaymentId: string, finalAmountEurCents: number, appFeeEurCents: number): Promise<{ balanceDueEurCents: number }> {
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    const due = onlineBalanceDueEurCents(finalAmountEurCents, jp.paidEurCents - jp.refundedEurCents);
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        grossAmountEurCents: finalAmountEurCents,
        platformFeeEurCents: appFeeEurCents,
        netAmountEurCents: Math.max(0, finalAmountEurCents - appFeeEurCents - jp.stripeFeeEurCents),
        onlineStage: due > 0 ? "AWAITING_BALANCE" : "PAID",
        releaseDueAt: new Date(Date.now() + ONLINE_RELEASE_DAYS * DAY_MS),
      },
    });
    return { balanceDueEurCents: due };
  }

  /** Passa i soldi al professionista se è il momento (conferma del cliente o 7 giorni, nessuna segnalazione aperta). */
  async releaseIfDue(jobPaymentId: string, now: Date = new Date()): Promise<boolean> {
    const jp = await this.prisma.jobPayment.findUnique({
      where: { id: jobPaymentId },
      include: {
        booking: {
          include: {
            issue: { select: { status: true, appealedAt: true, appealDecision: true } },
            professionalProfile: { select: { id: true, userId: true, fiscalProfile: { select: { stripeConnectAccountId: true, stripePayoutsEnabled: true } } } },
            quote: { select: { guidedRequestId: true } },
          },
        },
      },
    });
    if (!jp || jp.paymentMethod !== "MANOVIA" || jp.releasedAt) return false;
    const booking = jp.booking;
    const issue = booking.issue;
    const issueOpen = !!issue && (OPEN_ISSUE_STATUSES.includes(issue.status) || issue.status === "UPHELD");
    const can = onlineCanRelease({
      stage: jp.onlineStage as JobPaymentOnlineStage | null,
      professionalCompletedAt: booking.professionalCompletedAt,
      clientConfirmedAt: booking.clientConfirmedCompletedAt,
      releaseDueAt: jp.releaseDueAt,
      issueOpen,
      now,
    });
    if (!can || booking.finalAmountEurCents === null) return false;

    const account = booking.professionalProfile.fiscalProfile;
    if (!account?.stripeConnectAccountId || !account.stripePayoutsEnabled) {
      // Senza conto Stripe attivo i soldi restano in custodia: lo avvisiamo
      // e riproviamo al giro successivo.
      await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_PAYOUT_ACCOUNT_NEEDED", {
        bookingId: booking.id,
        guidedRequestId: booking.quote?.guidedRequestId ?? null,
      });
      return false;
    }
    if (!this.stripe) {
      this.logger.warn(`Accredito di ${jp.id} rimandato: Stripe non configurato.`);
      return false;
    }
    const stripe = this.stripe;
    const balanceUnpaid = jp.onlineStage === "AWAITING_BALANCE";
    const { payout, refundToClient } = onlinePayoutEurCents({
      finalAmountEurCents: booking.finalAmountEurCents,
      paidEurCents: jp.paidEurCents,
      refundedEurCents: jp.refundedEurCents,
      stripeFeeEurCents: jp.stripeFeeEurCents,
      appFeeEurCents: balanceUnpaid
        ? Math.round((jp.platformFeeEurCents * (jp.paidEurCents - jp.refundedEurCents)) / Math.max(1, booking.finalAmountEurCents))
        : jp.platformFeeEurCents,
    });

    // Update condizionato: due giri concorrenti non trasferiscono due volte.
    const claimed = await this.prisma.jobPayment.updateMany({ where: { id: jp.id, releasedAt: null }, data: { releasedAt: now } });
    if (claimed.count === 0) return false;
    // Dopo il trasferimento i soldi sono partiti: un errore successivo (scrittura
    // sul database) non deve più rimettere il pagamento in coda, altrimenti il
    // giro dopo trasferirebbe una seconda volta (docs/CHANGELOG.md §170).
    let moneyMoved = false;
    try {
      if (refundToClient > 0) await this.refundAcrossPayments(jp.id, refundToClient, "Differenza tra acconto e importo finale.");
      const transfer =
        payout > 0
          ? await stripe.transfers.create(
              { amount: payout, currency: "eur", destination: account.stripeConnectAccountId, transfer_group: booking.id },
              { idempotencyKey: `job-release-${jp.id}` },
            )
          : null;
      moneyMoved = true;
      const appFee = (jp.paidEurCents - jp.refundedEurCents - refundToClient) - payout - jp.stripeFeeEurCents;
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: {
          onlineStage: "RELEASED",
          status: "CONFIRMED",
          stripeTransferId: transfer?.id ?? null,
          netAmountEurCents: payout,
          platformFeeEurCents: Math.max(0, appFee),
          ...(balanceUnpaid ? { balanceUnpaidAt: now } : {}),
        },
      });
      await this.prisma.manoviaRevenue.create({
        data: { source: "JOB_COMMISSION", amountEurCents: Math.max(0, appFee), jobPaymentId: jp.id, professionalProfileId: booking.professionalProfile.id },
      });
      await this.auditLogService.record({
        entityType: "JobPayment",
        entityId: jp.id,
        fieldName: "onlineStage",
        oldValue: jp.onlineStage,
        newValue: { stage: "RELEASED", payout, refundToClient, balanceUnpaid, transferId: transfer?.id ?? null },
        reason: balanceUnpaid ? "Saldo non pagato entro 7 giorni: al professionista quanto incassato." : "Pagamento passato al professionista.",
      });
      await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_PAYOUT_SENT", {
        bookingId: booking.id,
        guidedRequestId: booking.quote?.guidedRequestId ?? null,
        amountEurCents: payout,
        balanceUnpaid,
      });
      if (balanceUnpaid) await this.reportUnpaidBalance(booking.id, booking.clientId, booking.quote?.guidedRequestId ?? null);
      return true;
    } catch (err) {
      if (moneyMoved) {
        this.logger.error(`Accredito di ${jp.id} eseguito su Stripe ma non registrato del tutto: ${(err as Error).message}`);
        return true;
      }
      await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { releasedAt: null } });
      this.logger.error(`Trasferimento non riuscito per ${jp.id}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Saldo non pagato (decisione dell'utente): avviso al cliente e al nostro team. */
  private async reportUnpaidBalance(bookingId: string, clientId: string, guidedRequestId: string | null): Promise<void> {
    await this.notificationsService.notify(clientId, "JOB_BALANCE_UNPAID", { bookingId, guidedRequestId, audience: "CLIENT" });
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER") || roles.includes("FINANCE")) {
        await this.notificationsService.notify(admin.id, "ADMIN_JOB_BALANCE_UNPAID", { bookingId });
      }
    }
  }

  /** Ogni ora: i pagamenti online arrivati al momento dell'accredito. */
  @Cron(CronExpression.EVERY_HOUR)
  async runReleases(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.jobPayment.findMany({
      where: { paymentMethod: "MANOVIA", releasedAt: null, onlineStage: { in: ["PAID", "AWAITING_BALANCE"] }, releaseDueAt: { lte: now } },
      select: { id: true },
    });
    let released = 0;
    for (const row of due) {
      try {
        if (await this.releaseIfDue(row.id, now)) released += 1;
      } catch (err) {
        this.logger.error(`Accredito non riuscito per ${row.id}: ${(err as Error).message}`);
      }
    }
    return released;
  }

  /**
   * Rimborso al cliente di un lavoro pagato online. Se i soldi erano già
   * passati al professionista, la sua quota viene ripresa dal suo conto
   * Stripe (storno del trasferimento).
   */
  async refundOnline(jobPaymentId: string, amountEurCents: number | "ALL", reason: string, byUserId: string | null): Promise<number> {
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId } });
    if (!jp || jp.paymentMethod !== "MANOVIA") throw new NotFoundException("Nessun pagamento online su questo lavoro.");
    const available = jp.paidEurCents - jp.refundedEurCents;
    const amount = amountEurCents === "ALL" ? available : Math.min(amountEurCents, available);
    if (amount <= 0) return 0;
    if (jp.stripeTransferId && jp.netAmountEurCents > 0) {
      await this.requireStripe().transfers.createReversal(
        jp.stripeTransferId,
        { amount: Math.min(amount, jp.netAmountEurCents) },
        { idempotencyKey: `job-reversal-${jp.stripeTransferId}-${jp.refundedEurCents}` },
      );
    }
    await this.refundAcrossPayments(jp.id, amount, reason);
    const after = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } });
    const fullyRefunded = after.refundedEurCents >= after.paidEurCents;
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: fullyRefunded ? { onlineStage: "REFUNDED", status: "REFUNDED", releasedAt: after.releasedAt ?? new Date() } : {},
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "refundedEurCents",
      oldValue: jp.refundedEurCents,
      newValue: after.refundedEurCents,
      changedByUserId: byUserId,
      reason,
    });
    return amount;
  }

  /** Rimborso Stripe spalmato sui due pagamenti (prima il saldo, poi l'acconto). */
  private async refundAcrossPayments(jobPaymentId: string, amountEurCents: number, reason: string): Promise<void> {
    const stripe = this.requireStripe();
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    let remaining = amountEurCents;
    for (const pi of [jp.balancePaymentIntentId, jp.stripePaymentIntentId]) {
      if (!pi || remaining <= 0) continue;
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
      const charge = intent.latest_charge as Stripe.Charge | null;
      const refundable = charge ? charge.amount - charge.amount_refunded : 0;
      const part = Math.min(remaining, refundable);
      if (part <= 0) continue;
      // Chiave legata a quanto già rimborsato: un nuovo tentativo dello stesso
      // rimborso non parte due volte, un rimborso successivo sì.
      await stripe.refunds.create(
        { payment_intent: pi, amount: part, metadata: { jobPaymentId, reason: reason.slice(0, 450) } },
        { idempotencyKey: `job-refund-${pi}-${charge?.amount_refunded ?? 0}-${part}` },
      );
      remaining -= part;
    }
    const refunded = amountEurCents - remaining;
    await this.prisma.jobPayment.update({ where: { id: jobPaymentId }, data: { refundedEurCents: { increment: refunded } } });
  }
}
