import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import {
  ONLINE_APP_FEE_PERCENT,
  ONLINE_LONG_HOLD_ALERT_DAYS,
  ONLINE_RELEASE_DAYS,
  onlineApplicationFeeHoldEurCents,
  onlineBalanceDueEurCents,
  onlineTargetEurCents,
  onlineCanRelease,
  onlinePayoutEurCents,
  type JobPaymentOnlineStage,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { readStripeConnectStatus } from "../professional-fiscal/stripe-connect-status";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_ISSUE_STATUSES = ["CHAT", "OPEN"];
// Esiti finali di una contestazione in banca (Stripe Dispute.status).
const CLOSED_DISPUTE_STATUSES = ["won", "lost", "warning_closed", "prevented"];

// Il bonifico non riuscito si riprova una volta al giorno (dati bancari da sistemare).
const PAYOUT_RETRY_AFTER_FAILURE_MS = DAY_MS;

/** Dati di un addebito Stripe utili al flusso dei soldi. */
type ChargeInfo = {
  fee: number;
  chargeId: string | null;
  /** Conto Stripe del professionista se l'addebito è "a destinazione" (§248). */
  destination: string | null;
  /** Trattenuta della piattaforma (application fee) sull'addebito. */
  applicationFeeAmount: number;
};

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function eurAmount(entries: Array<{ amount: number; currency: string }> | undefined): number {
  return (entries ?? []).filter((entry) => entry.currency === "eur").reduce((sum, entry) => sum + entry.amount, 0);
}

function disputeOpen(jp: { stripeDisputeId: string | null; stripeDisputeStatus: string | null }): boolean {
  return !!jp.stripeDisputeId && !CLOSED_DISPUTE_STATUSES.includes(jp.stripeDisputeStatus ?? "");
}

/**
 * Soldi dei pagamenti online dei lavori (docs/CHANGELOG.md §168, §248):
 * acconto e saldo pagati dal cliente con Stripe Checkout e addebitati "a
 * destinazione" sul conto Stripe del professionista (destination charges di
 * Stripe Connect), mai in custodia sul conto della piattaforma (decisione
 * dell'utente del 14/10/2026). La piattaforma trattiene commissione e costo
 * della carta come application fee. I bonifici dal conto Stripe del
 * professionista alla sua banca sono manuali: i soldi restano bloccati lì
 * finché il cliente non conferma il lavoro o per 7 giorni dalla chiusura
 * (Stripe li paga comunque dopo 90 giorni), poi il sito fa partire il
 * bonifico. Rimborsi al cliente (annullamenti, segnalazioni accolte,
 * differenza pagata in più) ripresi dal conto del professionista.
 *
 * I pagamenti registrati prima di §248 (`stripeDestinationAccountId` vuoto)
 * seguono il vecchio modello: custodia sulla piattaforma e trasferimento
 * allo sblocco.
 *
 * Modulo a parte, senza dipendenze da area admin o regole di commissione:
 * lo usano sia i pagamenti sia le segnalazioni, senza dipendenze circolari.
 * La commissione arriva già calcolata in `JobPayment.platformFeeEurCents`.
 */
/**
 * Suffisso dell'estratto conto per i pagamenti con carta: solo lettere,
 * cifre e spazi (Stripe rifiuta < > \ ' " *), almeno una lettera, al massimo
 * 10 caratteri perché prefisso e suffisso insieme stanno in 22.
 */
export function statementSuffix(businessName: string): string | null {
  const clean = businessName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10)
    .trim();
  return /[A-Za-z]/.test(clean) ? clean.toUpperCase() : null;
}

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
      // Col saldo diretto (§237) online si paga al massimo l'acconto: il resto va al professionista.
      amount = onlineBalanceDueEurCents(onlineTargetEurCents(booking.finalAmountEurCents, jp), jp.paidEurCents - jp.refundedEurCents);
      // Dopo l'accredito il saldo si può ancora pagare se era rimasto scoperto (§168).
      const closed = jp.onlineStage === "REFUNDED" || (jp.onlineStage === "RELEASED" && !jp.balanceUnpaidAt);
      if (amount <= 0 || closed) {
        throw new BadRequestException(jp.balanceDirect ? "Il saldo lo paghi direttamente al professionista." : "Non c'è nessun saldo da pagare.");
      }
    }

    const back = booking.quote
      ? `${this.frontendUrl()}/le-mie-richieste?tab=lavori&open=${booking.quote.guidedRequestId}`
      : `${this.frontendUrl()}/le-mie-richieste?tab=lavori`;
    const suffix = statementSuffix(booking.professionalProfile.businessName);
    // Un acconto già pagato col vecchio modello (custodia sulla piattaforma)
    // tiene lo stesso modello anche per il saldo: un lavoro non mescola i due.
    const legacy = jp.paidEurCents > 0 && !jp.stripeDestinationAccountId;
    const destination = legacy ? null : await this.destinationAccount(booking.professionalProfileId);
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
      payment_intent_data: {
        ...(destination ? this.destinationChargeData(destination, amount) : {}),
        transfer_group: bookingId,
        // Nome del professionista sull'estratto conto del cliente (docs/CHANGELOG.md §238): meno contestazioni "non riconosco l'addebito".
        ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
        metadata: { kind: "job_payment", part, jobPaymentId: jp.id, bookingId },
      },
      success_url: `${back}&pagamento=completato`,
      cancel_url: back,
      metadata: { kind: "job_payment", part, jobPaymentId: jp.id, bookingId },
    });
    return { url: session.url };
  }

  /**
   * Checkout dell'acconto al momento dell'accettazione del preventivo
   * (docs/CHANGELOG.md §240): il lavoro non esiste ancora, nasce solo quando
   * Stripe conferma il pagamento (`BookingsService.confirmQuoteDeposit`).
   * Scade dopo un'ora: un pagamento così tardivo su un preventivo cambiato
   * nel frattempo verrebbe comunque rimborsato.
   */
  async createQuoteDepositCheckout(params: {
    clientUserId: string;
    quoteId: string;
    guidedRequestId: string;
    paymentMethod: string;
    amountEurCents: number;
    businessName: string;
    professionalProfileId: string;
  }): Promise<{ url: string | null }> {
    const back = `${this.frontendUrl()}/le-mie-richieste?open=${params.guidedRequestId}`;
    const suffix = statementSuffix(params.businessName);
    const destination = await this.destinationAccount(params.professionalProfileId);
    const metadata = { kind: "quote_deposit", quoteId: params.quoteId, clientUserId: params.clientUserId, paymentMethod: params.paymentMethod };
    const session = await this.requireStripe().checkout.sessions.create({
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: params.amountEurCents,
            product_data: { name: `Acconto del lavoro con ${params.businessName}` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        ...this.destinationChargeData(destination, params.amountEurCents),
        ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
        metadata,
      },
      success_url: `${back}&pagamento=completato`,
      cancel_url: back,
      metadata,
    });
    return { url: session.url };
  }

  /**
   * Conto Stripe del professionista su cui addebitare un pagamento online
   * (docs/CHANGELOG.md §248): deve poter ricevere i soldi e avere i bonifici
   * verso la banca in manuale, altrimenti Stripe li manderebbe subito alla
   * sua banca e non sarebbero più bloccati. Se qualcosa manca il pagamento
   * non parte: meglio un errore chiaro che soldi non bloccati.
   */
  private async destinationAccount(professionalProfileId: string): Promise<string> {
    const stripe = this.requireStripe();
    const unavailable = "Il professionista non può ricevere pagamenti online in questo momento. Riprova più tardi o, se il preventivo lo prevede, scegli il pagamento diretto.";
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({
      where: { professionalProfileId },
      select: { id: true, stripeConnectAccountId: true, stripePayoutsEnabled: true, stripeManualPayoutsAt: true },
    });
    const accountId = fiscal?.stripeConnectAccountId;
    if (!fiscal || !accountId || !(await this.transfersActive(accountId, fiscal.stripePayoutsEnabled))) {
      throw new BadRequestException(unavailable);
    }
    if (!fiscal.stripeManualPayoutsAt) {
      try {
        await stripe.balanceSettings.update({ payments: { payouts: { schedule: { interval: "manual" } } } }, { stripeAccount: accountId });
      } catch (err) {
        this.logger.error(`Bonifici manuali non impostati per ${accountId}: ${(err as Error).message}`);
        throw new BadRequestException(unavailable);
      }
      await this.prisma.professionalFiscalProfile.update({ where: { id: fiscal.id }, data: { stripeManualPayoutsAt: new Date() } });
      await this.auditLogService.record({
        entityType: "ProfessionalFiscalProfile",
        entityId: fiscal.id,
        fieldName: "stripeManualPayoutsAt",
        newValue: "manual",
        reason: "Bonifici verso la banca in manuale: i soldi dei lavori restano bloccati fino allo sblocco.",
      });
    }
    return accountId;
  }

  /** Addebito a destinazione sul conto del professionista con la trattenuta della piattaforma. */
  private destinationChargeData(destination: string, amountEurCents: number) {
    return { transfer_data: { destination }, application_fee_amount: onlineApplicationFeeHoldEurCents(amountEurCents) };
  }

  /** Acconto pagato su un preventivo che non si può più confermare: torna tutto al cliente. */
  async refundQuoteDeposit(paymentIntentId: string, reason: string): Promise<void> {
    const stripe = this.requireStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    // Addebito sul conto del professionista: si riprende da lì e la
    // piattaforma restituisce anche la sua trattenuta.
    const destination = !!intent.transfer_data?.destination;
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(destination ? { reverse_transfer: true, refund_application_fee: true } : {}),
        metadata: { reason: reason.slice(0, 450) },
      },
      { idempotencyKey: `quote-deposit-refund-${paymentIntentId}` },
    );
    this.logger.warn(`Acconto ${paymentIntentId} rimborsato: ${reason}`);
  }

  /** Webhook `checkout.session.completed` di un acconto o saldo. Idempotente sul payment intent. */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const jobPaymentId = session.metadata?.jobPaymentId;
    const part = session.metadata?.part === "balance" ? "balance" : "deposit";
    if (!jobPaymentId) return;
    await this.recordCheckoutPayment(jobPaymentId, part, session, { notify: true });
  }

  /**
   * Registra un acconto o saldo pagato con Checkout sul pagamento del lavoro.
   * `notify: false` per l'acconto che conferma il lavoro: il professionista
   * riceve già l'avviso "preventivo accettato".
   */
  async recordCheckoutPayment(jobPaymentId: string, part: "deposit" | "balance", session: Stripe.Checkout.Session, opts: { notify: boolean }): Promise<void> {
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntentId) return;
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId }, include: { booking: true } });
    if (!jp) return;
    if (jp.stripePaymentIntentId === paymentIntentId || jp.balancePaymentIntentId === paymentIntentId) return;

    const amount = session.amount_total ?? 0;
    const charge = await this.chargeOf(paymentIntentId);

    // Saldo pagato in ritardo, dopo che l'acconto era già passato al
    // professionista: gli giriamo subito anche questa parte.
    if (part === "balance" && jp.releasedAt && jp.balanceUnpaidAt) {
      await this.settleLateBalance(jp.id, paymentIntentId, amount, charge);
      return;
    }
    const paid = jp.paidEurCents + amount;
    const final = jp.booking.finalAmountEurCents;
    let stage: JobPaymentOnlineStage;
    if (final === null) stage = "DEPOSIT_PAID";
    else stage = onlineBalanceDueEurCents(onlineTargetEurCents(final, jp), paid - jp.refundedEurCents) > 0 ? "AWAITING_BALANCE" : "PAID";

    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        paidEurCents: paid,
        stripeFeeEurCents: jp.stripeFeeEurCents + charge.fee,
        onlineStage: stage,
        status: "PENDING",
        ...(charge.destination
          ? { stripeDestinationAccountId: charge.destination, applicationFeeEurCents: jp.applicationFeeEurCents + charge.applicationFeeAmount }
          : {}),
        ...(part === "deposit" ? { stripePaymentIntentId: paymentIntentId, depositPaidAt: new Date() } : { balancePaymentIntentId: paymentIntentId, balancePaidAt: new Date() }),
      },
    });
    // La trattenuta conteneva il costo massimo della carta: appena Stripe dà
    // quello reale, la differenza torna sul conto del professionista.
    if (charge.destination && charge.fee > 0) {
      const extra = charge.applicationFeeAmount - (Math.round((amount * ONLINE_APP_FEE_PERCENT) / 100) + charge.fee);
      if (extra > 0) await this.returnApplicationFee(jp.id, extra, "Conguaglio del costo della carta.").catch((err) => this.logger.warn(`Conguaglio non riuscito per ${jp.id}: ${(err as Error).message}`));
    }
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: part === "deposit" ? "depositPaidAt" : "balancePaidAt",
      newValue: { amountEurCents: amount, stripeFeeEurCents: charge.fee, stage, destination: charge.destination, applicationFeeEurCents: charge.applicationFeeAmount },
      reason: charge.destination
        ? `${part === "deposit" ? "Acconto" : "Saldo"} pagato online (Stripe), bloccato sul conto del professionista.`
        : `${part === "deposit" ? "Acconto" : "Saldo"} pagato online (Stripe).`,
    });
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: jp.booking.professionalProfileId }, select: { userId: true } });
    const quote = jp.booking.quoteId ? await this.prisma.quote.findUnique({ where: { id: jp.booking.quoteId }, select: { guidedRequestId: true } }) : null;
    if (pro && opts.notify) {
      await this.notificationsService.notify(pro.userId, part === "deposit" ? "JOB_DEPOSIT_PAID" : "JOB_BALANCE_PAID", {
        bookingId: jp.bookingId,
        guidedRequestId: quote?.guidedRequestId ?? null,
        amountEurCents: amount,
      });
    }
    if (stage === "PAID") await this.releaseIfDue(jp.id);
  }

  private async settleLateBalance(jobPaymentId: string, paymentIntentId: string, amount: number, charge: ChargeInfo): Promise<void> {
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
    let payout: number;
    let transfer: Stripe.Transfer | null = null;
    let held = 0;
    if (charge.destination) {
      // I soldi sono già sul conto del professionista: la piattaforma tiene
      // commissione e costo della carta e il resto parte subito verso la banca.
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: { balancePaymentIntentId: paymentIntentId, applicationFeeEurCents: { increment: charge.applicationFeeAmount } },
      });
      const extra = charge.applicationFeeAmount - (appFee + charge.fee);
      const returned = extra > 0 ? await this.returnApplicationFee(jp.id, extra, "Conguaglio del saldo pagato in ritardo.") : 0;
      held = charge.applicationFeeAmount - returned;
      payout = Math.max(0, amount - held);
    } else {
      payout = Math.max(0, amount - appFee - charge.fee);
      const destination = jp.booking.professionalProfile.fiscalProfile?.stripeConnectAccountId;
      transfer =
        payout > 0 && destination
          ? await this.requireStripe().transfers.create(
              // Legato al pagamento appena arrivato (`source_transaction`): Stripe
              // lo esegue anche se quei soldi non sono ancora disponibili sul
              // saldo della piattaforma (in Italia restano in attesa alcuni giorni).
              { amount: payout, currency: "eur", destination, transfer_group: jp.bookingId, ...(charge.chargeId ? { source_transaction: charge.chargeId } : {}) },
              { idempotencyKey: `job-late-balance-${paymentIntentId}` },
            )
          : null;
    }
    const platformFee = charge.destination ? Math.max(0, held - charge.fee) : appFee;
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        balancePaymentIntentId: paymentIntentId,
        balancePaidAt: new Date(),
        paidEurCents: { increment: amount },
        stripeFeeEurCents: { increment: charge.fee },
        platformFeeEurCents: { increment: platformFee },
        netAmountEurCents: { increment: payout },
        ...(charge.destination ? { payoutPendingEurCents: { increment: payout } } : {}),
        balanceUnpaidAt: null,
      },
    });
    await this.prisma.manoviaRevenue.create({
      data: { source: "JOB_COMMISSION", amountEurCents: platformFee, jobPaymentId: jp.id, professionalProfileId: jp.booking.professionalProfile.id },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "balancePaidAt",
      newValue: { amountEurCents: amount, payout, transferId: transfer?.id ?? null, destination: charge.destination },
      reason: "Saldo pagato in ritardo e girato al professionista.",
    });
    await this.notificationsService.notify(jp.booking.professionalProfile.userId, "JOB_PAYOUT_SENT", {
      bookingId: jp.bookingId,
      guidedRequestId: jp.booking.quote?.guidedRequestId ?? null,
      amountEurCents: payout,
    });
    if (charge.destination) await this.sendPayout(jp.id).catch((err) => this.logger.warn(`Bonifico rimandato per ${jp.id}: ${(err as Error).message}`));
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
      dueEurCents: onlineBalanceDueEurCents(onlineTargetEurCents(jp.booking.finalAmountEurCents ?? 0, jp), jp.paidEurCents - jp.refundedEurCents),
      client: {
        userId: jp.booking.client.id,
        name: [jp.booking.client.name, jp.booking.client.surname].filter(Boolean).join(" ") || null,
        email: jp.booking.client.email,
      },
      professional: { userId: jp.booking.professionalProfile.userId, businessName: jp.booking.professionalProfile.businessName },
    }));
  }

  /**
   * Costo Stripe reale del pagamento (dalla balance transaction, 0 se non
   * disponibile), id dell'addebito e, per gli addebiti a destinazione, conto
   * del professionista e trattenuta della piattaforma.
   */
  private async chargeOf(paymentIntentId: string): Promise<ChargeInfo> {
    const empty: ChargeInfo = { fee: 0, chargeId: null, destination: null, applicationFeeAmount: 0 };
    if (!this.stripe) return empty;
    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    } catch (err) {
      this.logger.warn(`Costo Stripe non letto per ${paymentIntentId}: ${(err as Error).message}`);
      return empty;
    }
    const charge = pi.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    const destination = idOf(pi.transfer_data?.destination ?? charge?.transfer_data?.destination ?? null);
    return {
      fee: bt?.fee ?? 0,
      chargeId: charge?.id ?? null,
      destination,
      applicationFeeAmount: destination ? (charge?.application_fee_amount ?? pi.application_fee_amount ?? 0) : 0,
    };
  }

  /**
   * Dopo la chiusura del lavoro (importo finale noto): fase del saldo e data
   * in cui i soldi passano al professionista se il cliente non conferma.
   */
  async afterCompletion(jobPaymentId: string, finalAmountEurCents: number, appFeeEurCents: number): Promise<{ balanceDueEurCents: number }> {
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    // Col saldo diretto (§237) da Stripe passa solo l'acconto: il saldo online è già a zero.
    const onlineTarget = onlineTargetEurCents(finalAmountEurCents, jp);
    const due = onlineBalanceDueEurCents(onlineTarget, jp.paidEurCents - jp.refundedEurCents);
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        grossAmountEurCents: finalAmountEurCents,
        platformFeeEurCents: appFeeEurCents,
        netAmountEurCents: Math.max(0, onlineTarget - appFeeEurCents - jp.stripeFeeEurCents),
        onlineStage: due > 0 ? "AWAITING_BALANCE" : "PAID",
        releaseDueAt: new Date(Date.now() + ONLINE_RELEASE_DAYS * DAY_MS),
      },
    });
    return { balanceDueEurCents: due };
  }

  /**
   * Sblocca i soldi al professionista se è il momento (conferma del cliente o
   * 7 giorni, nessuna segnalazione né contestazione aperta). Con l'addebito
   * sul suo conto (§248) restituisce il conguaglio della trattenuta e fa
   * partire il bonifico verso la sua banca; col vecchio modello trasferisce
   * dal conto della piattaforma.
   */
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
    // Contestazione in banca aperta: i soldi restano bloccati finché la banca non decide.
    if (disputeOpen(jp)) return false;

    // Col vecchio modello i soldi sono sulla piattaforma e serve un conto
    // Stripe attivo per trasferirli. Con l'addebito sul conto del
    // professionista sono già lì: manca solo il bonifico.
    const destinationModel = !!jp.stripeDestinationAccountId;
    const account = booking.professionalProfile.fiscalProfile;
    if (!destinationModel) {
      const transfersActive = account?.stripeConnectAccountId ? await this.transfersActive(account.stripeConnectAccountId, account.stripePayoutsEnabled) : false;
      if (!account?.stripeConnectAccountId || !transfersActive) {
        // Senza conto Stripe attivo i soldi restano in custodia: lo avvisiamo
        // e riproviamo al giro successivo.
        await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_PAYOUT_ACCOUNT_NEEDED", {
          bookingId: booking.id,
          guidedRequestId: booking.quote?.guidedRequestId ?? null,
        });
        return false;
      }
    }
    if (!this.stripe) {
      this.logger.warn(`Sblocco di ${jp.id} rimandato: Stripe non configurato.`);
      return false;
    }
    const stripe = this.stripe;
    const balanceUnpaid = jp.onlineStage === "AWAITING_BALANCE";
    // Col saldo diretto (§237) il dovuto online è solo l'acconto: se l'importo
    // finale è più basso, la differenza torna al cliente.
    const onlineTarget = onlineTargetEurCents(booking.finalAmountEurCents, jp);
    const { payout, refundToClient } = onlinePayoutEurCents({
      finalAmountEurCents: onlineTarget,
      paidEurCents: jp.paidEurCents,
      refundedEurCents: jp.refundedEurCents,
      stripeFeeEurCents: jp.stripeFeeEurCents,
      appFeeEurCents: balanceUnpaid
        ? Math.round((jp.platformFeeEurCents * (jp.paidEurCents - jp.refundedEurCents)) / Math.max(1, onlineTarget))
        : jp.platformFeeEurCents,
    });

    // Update condizionato: due giri concorrenti non sbloccano due volte.
    const claimed = await this.prisma.jobPayment.updateMany({ where: { id: jp.id, releasedAt: null }, data: { releasedAt: now } });
    if (claimed.count === 0) return false;
    // Dopo il movimento dei soldi un errore successivo (scrittura sul
    // database) non deve più rimettere il pagamento in coda, altrimenti il
    // giro dopo li muoverebbe una seconda volta (docs/CHANGELOG.md §170).
    let moneyMoved = false;
    try {
      if (refundToClient > 0) await this.refundAcrossPayments(jp.id, refundToClient, "Differenza tra acconto e importo finale.", { beforeRelease: true });
      let netPayout = payout;
      let transfer: Stripe.Transfer | null = null;
      if (destinationModel) {
        // Il professionista ha già tutto sul suo conto meno la trattenuta: la
        // piattaforma tiene solo commissione e costo della carta e restituisce
        // il resto. Se la trattenuta fosse più bassa (regola di commissione
        // più alta del 5%), la differenza resta a carico della piattaforma.
        const fresh = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } });
        const collected = fresh.paidEurCents - fresh.refundedEurCents;
        const keep = Math.max(0, collected - payout);
        const extra = fresh.applicationFeeEurCents - keep;
        if (extra > 0) await this.returnApplicationFee(jp.id, extra, "Conguaglio allo sblocco.");
        else if (extra < 0) this.logger.warn(`Trattenuta di ${jp.id} più bassa del dovuto di ${-extra} centesimi.`);
        netPayout = Math.max(0, collected - Math.min(fresh.applicationFeeEurCents, keep));
      } else if (payout > 0) {
        transfer = await stripe.transfers.create(
          { amount: payout, currency: "eur", destination: account!.stripeConnectAccountId!, transfer_group: booking.id },
          { idempotencyKey: `job-release-${jp.id}` },
        );
      }
      moneyMoved = true;
      const after = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } });
      const appFee = after.paidEurCents - after.refundedEurCents - netPayout - after.stripeFeeEurCents;
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: {
          onlineStage: "RELEASED",
          status: "CONFIRMED",
          stripeTransferId: transfer?.id ?? null,
          netAmountEurCents: netPayout,
          platformFeeEurCents: Math.max(0, appFee),
          ...(destinationModel ? { payoutPendingEurCents: netPayout } : {}),
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
        newValue: { stage: "RELEASED", payout: netPayout, refundToClient, balanceUnpaid, transferId: transfer?.id ?? null, destination: jp.stripeDestinationAccountId },
        reason: balanceUnpaid
          ? "Saldo non pagato entro 7 giorni: al professionista quanto incassato."
          : destinationModel
            ? "Soldi sbloccati sul conto Stripe del professionista: parte il bonifico."
            : "Pagamento passato al professionista.",
      });
      await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_PAYOUT_SENT", {
        bookingId: booking.id,
        guidedRequestId: booking.quote?.guidedRequestId ?? null,
        amountEurCents: netPayout,
        balanceUnpaid,
      });
      if (balanceUnpaid) await this.reportUnpaidBalance(booking.id, booking.clientId, booking.quote?.guidedRequestId ?? null);
      if (destinationModel) await this.sendPayout(jp.id, now).catch((err) => this.logger.warn(`Bonifico rimandato per ${jp.id}: ${(err as Error).message}`));
      return true;
    } catch (err) {
      if (moneyMoved) {
        this.logger.error(`Sblocco di ${jp.id} eseguito su Stripe ma non registrato del tutto: ${(err as Error).message}`);
        return true;
      }
      await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { releasedAt: null } });
      this.logger.error(`Sblocco non riuscito per ${jp.id}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Bonifico dal conto Stripe del professionista alla sua banca per un lavoro
   * sbloccato (docs/CHANGELOG.md §248). Parte solo se sul conto ci sono
   * abbastanza soldi disponibili senza toccare quelli ancora bloccati per
   * altri lavori; altrimenti si riprova al giro successivo (i soldi appena
   * pagati restano "in arrivo" su Stripe per qualche giorno).
   */
  async sendPayout(jobPaymentId: string, now: Date = new Date()): Promise<boolean> {
    if (!this.stripe) return false;
    const stripe = this.stripe;
    const jp = await this.prisma.jobPayment.findUnique({
      where: { id: jobPaymentId },
      include: { booking: { select: { id: true, professionalProfile: { select: { userId: true } }, quote: { select: { guidedRequestId: true } } } } },
    });
    const accountId = jp?.stripeDestinationAccountId;
    if (!jp || !accountId || jp.payoutPendingEurCents <= 0) return false;
    const amount = jp.payoutPendingEurCents;

    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    const available = eurAmount(balance.available);
    const incoming = eurAmount(balance.pending);
    const others = await this.prisma.jobPayment.findMany({
      where: {
        stripeDestinationAccountId: accountId,
        id: { not: jp.id },
        OR: [{ releasedAt: null, onlineStage: { notIn: ["REFUNDED", "AWAITING_DEPOSIT"] } }, { payoutPendingEurCents: { gt: 0 } }],
      },
      select: { releasedAt: true, paidEurCents: true, refundedEurCents: true, applicationFeeEurCents: true, payoutPendingEurCents: true },
    });
    // Soldi che devono restare sul conto: quelli ancora bloccati e i bonifici di altri lavori in attesa.
    const reserved = others.reduce(
      (sum, o) => sum + (o.releasedAt ? o.payoutPendingEurCents : Math.max(0, o.paidEurCents - o.refundedEurCents - o.applicationFeeEurCents)),
      0,
    );
    if (Math.min(available, available + incoming - reserved) < amount) return false;

    const claimed = await this.prisma.jobPayment.updateMany({ where: { id: jp.id, payoutPendingEurCents: amount }, data: { payoutPendingEurCents: 0 } });
    if (claimed.count === 0) return false;
    let payout: Stripe.Payout;
    try {
      payout = await stripe.payouts.create(
        { amount, currency: "eur", description: "Lavoro sbloccato", metadata: { kind: "job_payout", jobPaymentId: jp.id, bookingId: jp.bookingId } },
        { stripeAccount: accountId, idempotencyKey: `job-payout-${jp.id}-${jp.payoutSentEurCents}-${amount}` },
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      const insufficient = code === "balance_insufficient";
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: {
          payoutPendingEurCents: { increment: amount },
          ...(insufficient ? {} : { payoutFailedAt: now, payoutFailureMessage: (err as Error).message.slice(0, 500) }),
        },
      });
      if (!insufficient) {
        this.logger.error(`Bonifico non riuscito per ${jp.id}: ${(err as Error).message}`);
        if (!jp.payoutFailedAt) await this.notifyPayoutFailed(jp.booking.professionalProfile.userId, jp.booking.id, jp.booking.quote?.guidedRequestId ?? null, amount);
      }
      return false;
    }
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        payoutSentEurCents: { increment: amount },
        stripePayoutId: payout.id,
        payoutSentAt: now,
        payoutPaidAt: null,
        payoutFailedAt: null,
        payoutFailureMessage: null,
      },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "stripePayoutId",
      newValue: { payoutId: payout.id, amountEurCents: amount },
      reason: "Bonifico verso la banca del professionista partito.",
    });
    return true;
  }

  /** Webhook `payout.paid` / `payout.failed` / `payout.canceled` dal conto del professionista. */
  async handlePayoutEvent(payout: Stripe.Payout): Promise<void> {
    const jobPaymentId = payout.metadata?.jobPaymentId;
    if (!jobPaymentId) return;
    const jp = await this.prisma.jobPayment.findUnique({
      where: { id: jobPaymentId },
      include: { booking: { select: { id: true, professionalProfile: { select: { userId: true } }, quote: { select: { guidedRequestId: true } } } } },
    });
    if (!jp || jp.stripePayoutId !== payout.id) return;
    if (payout.status === "paid") {
      if (!jp.payoutPaidAt) await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { payoutPaidAt: new Date((payout.arrival_date ?? Date.now() / 1000) * 1000) } });
      return;
    }
    if (payout.status !== "failed" && payout.status !== "canceled") return;
    // Stripe rimette i soldi sul conto del professionista: si riprova dopo che ha sistemato i dati bancari.
    const updated = await this.prisma.jobPayment.updateMany({
      where: { id: jp.id, stripePayoutId: payout.id },
      data: {
        stripePayoutId: null,
        payoutPendingEurCents: { increment: payout.amount },
        payoutSentEurCents: { decrement: payout.amount },
        payoutFailedAt: new Date(),
        payoutFailureMessage: (payout.failure_message ?? "Bonifico non riuscito.").slice(0, 500),
      },
    });
    if (updated.count === 0) return;
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "stripePayoutId",
      oldValue: payout.id,
      newValue: { status: payout.status, failureCode: payout.failure_code ?? null },
      reason: "Bonifico verso la banca del professionista non riuscito.",
    });
    await this.notifyPayoutFailed(jp.booking.professionalProfile.userId, jp.booking.id, jp.booking.quote?.guidedRequestId ?? null, payout.amount);
  }

  private async notifyPayoutFailed(userId: string, bookingId: string, guidedRequestId: string | null, amountEurCents: number): Promise<void> {
    await this.notificationsService.notify(userId, "JOB_PAYOUT_FAILED", { bookingId, guidedRequestId, amountEurCents });
  }

  /**
   * Riprova subito i bonifici in sospeso di un conto: quando il professionista
   * aggiorna il conto Stripe (anche quelli non riusciti) o quando Stripe rende
   * disponibili i suoi soldi (`skipFailed`: solo quelli in attesa, §248).
   */
  async retryPayoutsForAccount(accountId: string, options: { skipFailed?: boolean } = {}): Promise<void> {
    const rows = await this.prisma.jobPayment.findMany({
      where: { stripeDestinationAccountId: accountId, payoutPendingEurCents: { gt: 0 }, ...(options.skipFailed ? { payoutFailedAt: null } : {}) },
      select: { id: true },
    });
    for (const row of rows) await this.sendPayout(row.id).catch((err) => this.logger.warn(`Bonifico rimandato per ${row.id}: ${(err as Error).message}`));
  }

  /**
   * Prima di ogni trasferimento si rilegge da Stripe se l'account del
   * professionista può riceverlo (buona pratica Stripe, docs/CHANGELOG.md
   * §236): il webhook può essere in ritardo o non arrivare. Se Stripe non
   * risponde vale l'ultimo stato salvato.
   */
  private async transfersActive(accountId: string, saved: boolean): Promise<boolean> {
    if (!this.stripe) return saved;
    try {
      const status = await readStripeConnectStatus(this.stripe, accountId);
      if (status.transfersActive !== saved) {
        await this.prisma.professionalFiscalProfile.updateMany({
          where: { stripeConnectAccountId: accountId },
          data: { stripeChargesEnabled: status.transfersActive, stripePayoutsEnabled: status.transfersActive, stripeRequirementsStatus: status.requirements },
        });
      }
      return status.transfersActive;
    } catch (err) {
      this.logger.warn(`Stato Stripe non letto per ${accountId}: ${(err as Error).message}`);
      return saved;
    }
  }

  /**
   * Contestazione presso la banca del cliente (chargeback) su un acconto o un
   * saldo (webhook `charge.dispute.*`, docs/CHANGELOG.md §236). Decide la
   * banca, non noi né Stripe: finché è aperta l'accredito al professionista
   * resta bloccato e il nostro team deve mandare le prove dalla Dashboard
   * Stripe (preventivo accettato, chat, foto). Se la contestazione è persa la
   * cifra vale come restituita al cliente. Se i soldi erano già passati al
   * professionista, il recupero è una decisione del team (Finanza).
   * Restituisce false se il pagamento non è di un lavoro.
   */
  async handleStripeDispute(dispute: Stripe.Dispute): Promise<boolean> {
    const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    if (!paymentIntentId) return false;
    const jp = await this.prisma.jobPayment.findFirst({
      where: { OR: [{ stripePaymentIntentId: paymentIntentId }, { balancePaymentIntentId: paymentIntentId }] },
      include: { booking: { select: { id: true, professionalProfile: { select: { userId: true } }, quote: { select: { guidedRequestId: true } } } } },
    });
    if (!jp) return false;

    const opened = !jp.stripeDisputeId;
    const closed = CLOSED_DISPUTE_STATUSES.includes(dispute.status);
    const justClosed = closed && !CLOSED_DISPUTE_STATUSES.includes(jp.stripeDisputeStatus ?? "");
    const lost = dispute.status === "lost";
    // Contestazione persa: la banca ha restituito la cifra al cliente.
    const lostAmount = justClosed && lost ? Math.min(dispute.amount, jp.paidEurCents - jp.refundedEurCents) : 0;
    const refunded = jp.refundedEurCents + lostAmount;
    let statusData: Record<string, unknown> = {};
    if (!closed) statusData = { status: "DISPUTED" };
    else if (justClosed && lostAmount > 0 && refunded >= jp.paidEurCents) {
      statusData = { status: "REFUNDED", onlineStage: "REFUNDED", releasedAt: jp.releasedAt ?? new Date() };
    } else if (justClosed) statusData = { status: jp.releasedAt ? "CONFIRMED" : "PENDING" };
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        stripeDisputeId: dispute.id,
        stripeDisputeStatus: dispute.status,
        stripeDisputedAt: jp.stripeDisputedAt ?? new Date(),
        refundedEurCents: refunded,
        ...statusData,
      },
    });
    // Addebito sul conto del professionista con i soldi ancora bloccati
    // (§248): la cifra persa si riprende dal suo conto, come per un rimborso.
    if (lostAmount > 0 && jp.stripeDestinationAccountId && !jp.releasedAt) {
      await this.recoverFromProfessional(jp.id, lostAmount, `dispute-${dispute.id}`).catch((err) =>
        this.logger.error(`Contestazione persa ${dispute.id}: recupero dal conto del professionista non riuscito: ${(err as Error).message}`),
      );
    }
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "stripeDisputeStatus",
      oldValue: jp.stripeDisputeStatus,
      newValue: { disputeId: dispute.id, status: dispute.status, reason: dispute.reason, amountEurCents: dispute.amount, lostAmount },
      reason: closed ? `Contestazione in banca chiusa: ${dispute.status}.` : "Contestazione aperta dal cliente presso la sua banca.",
    });

    // Avvisiamo una volta all'apertura e una alla chiusura, non a ogni cambio intermedio.
    if (opened || justClosed) {
      const payload = {
        bookingId: jp.bookingId,
        guidedRequestId: jp.booking.quote?.guidedRequestId ?? null,
        amountEurCents: dispute.amount,
        status: dispute.status,
        alreadyReleased: !!jp.releasedAt,
      };
      await this.notifyFinanceAdmins("ADMIN_STRIPE_DISPUTE", payload);
      await this.notificationsService.notify(jp.booking.professionalProfile.userId, "JOB_STRIPE_DISPUTE", payload);
    }
    // Contestazione vinta: se era il momento, l'accredito parte subito.
    if (justClosed && !lost) await this.releaseIfDue(jp.id).catch(() => false);
    return true;
  }

  /** Avviso agli admin Finanza (o senza ruoli specifici / SUPER). */
  async notifyFinanceAdmins(type: string, payload: Record<string, unknown>): Promise<void> {
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER") || roles.includes("FINANCE")) {
        await this.notificationsService.notify(admin.id, type, payload as never);
      }
    }
  }

  /** Saldo non pagato (decisione dell'utente): avviso al cliente e al nostro team. */
  private async reportUnpaidBalance(bookingId: string, clientId: string, guidedRequestId: string | null): Promise<void> {
    await this.notificationsService.notify(clientId, "JOB_BALANCE_UNPAID", { bookingId, guidedRequestId, audience: "CLIENT" });
    await this.notifyFinanceAdmins("ADMIN_JOB_BALANCE_UNPAID", { bookingId });
  }

  /** Ogni ora: i pagamenti online arrivati al momento dello sblocco, poi i bonifici in attesa. */
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
        this.logger.error(`Sblocco non riuscito per ${row.id}: ${(err as Error).message}`);
      }
    }
    await this.runPayouts(now);
    await this.alertLongHolds(now);
    return released;
  }

  /**
   * Soldi bloccati da più di 80 giorni sul conto del professionista
   * (docs/CHANGELOG.md §248): Stripe non li tiene oltre 90 e poi li manda
   * comunque in banca, quindi il team Finanza decide prima se sbloccarli o
   * rimborsare il cliente. Un solo avviso per pagamento.
   */
  async alertLongHolds(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ONLINE_LONG_HOLD_ALERT_DAYS * DAY_MS);
    const rows = await this.prisma.jobPayment.findMany({
      where: {
        stripeDestinationAccountId: { not: null },
        releasedAt: null,
        longHoldAlertedAt: null,
        onlineStage: { notIn: ["REFUNDED", "AWAITING_DEPOSIT"] },
        OR: [{ depositPaidAt: { lte: cutoff } }, { depositPaidAt: null, balancePaidAt: { lte: cutoff } }],
      },
      select: { id: true, bookingId: true, depositPaidAt: true, balancePaidAt: true, booking: { select: { quote: { select: { guidedRequestId: true } } } } },
    });
    let alerted = 0;
    for (const row of rows) {
      const claimed = await this.prisma.jobPayment.updateMany({ where: { id: row.id, longHoldAlertedAt: null }, data: { longHoldAlertedAt: now } });
      if (claimed.count === 0) continue;
      const firstPaidAt = row.depositPaidAt ?? row.balancePaidAt ?? now;
      const days = Math.floor((now.getTime() - firstPaidAt.getTime()) / DAY_MS);
      await this.notifyFinanceAdmins("ADMIN_JOB_PAYMENT_LONG_HOLD", { bookingId: row.bookingId, guidedRequestId: row.booking.quote?.guidedRequestId ?? null, days });
      alerted += 1;
    }
    return alerted;
  }

  /** Bonifici sbloccati ma non ancora partiti; quelli non riusciti si riprovano una volta al giorno. */
  async runPayouts(now: Date = new Date()): Promise<number> {
    const pending = await this.prisma.jobPayment.findMany({
      where: {
        stripeDestinationAccountId: { not: null },
        payoutPendingEurCents: { gt: 0 },
        OR: [{ payoutFailedAt: null }, { payoutFailedAt: { lte: new Date(now.getTime() - PAYOUT_RETRY_AFTER_FAILURE_MS) } }],
      },
      select: { id: true },
    });
    let sent = 0;
    for (const row of pending) {
      try {
        if (await this.sendPayout(row.id, now)) sent += 1;
      } catch (err) {
        this.logger.warn(`Bonifico rimandato per ${row.id}: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  /**
   * Rimborso al cliente di un lavoro pagato online. Con l'addebito sul conto
   * del professionista (§248) i soldi si riprendono da lì; se erano già
   * sbloccati se ne riprende al massimo la sua quota, come quando erano
   * stati trasferiti col vecchio modello (storno del trasferimento).
   */
  async refundOnline(jobPaymentId: string, amountEurCents: number | "ALL", reason: string, byUserId: string | null): Promise<number> {
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId } });
    if (!jp || jp.paymentMethod !== "MANOVIA") throw new NotFoundException("Nessun pagamento online su questo lavoro.");
    const available = jp.paidEurCents - jp.refundedEurCents;
    const amount = amountEurCents === "ALL" ? available : Math.min(amountEurCents, available);
    if (amount <= 0) return 0;
    if (jp.stripeDestinationAccountId) {
      if (jp.releasedAt && jp.netAmountEurCents > 0) {
        const recovered = await this.reverseFromProfessional(jp.id, Math.min(amount, jp.netAmountEurCents), `refund-${jp.refundedEurCents}`);
        // Se il bonifico non era ancora partito, parte solo per quanto resta.
        await this.prisma.jobPayment.update({
          where: { id: jp.id },
          data: { netAmountEurCents: { decrement: recovered }, payoutPendingEurCents: Math.max(0, jp.payoutPendingEurCents - recovered) },
        });
      }
    } else if (jp.stripeTransferId && jp.netAmountEurCents > 0) {
      await this.requireStripe().transfers.createReversal(
        jp.stripeTransferId,
        { amount: Math.min(amount, jp.netAmountEurCents) },
        { idempotencyKey: `job-reversal-${jp.stripeTransferId}-${jp.refundedEurCents}` },
      );
    }
    await this.refundAcrossPayments(jp.id, amount, reason, { beforeRelease: !jp.releasedAt });
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

  /**
   * Rimborso Stripe spalmato sui due pagamenti (prima il saldo, poi l'acconto).
   * Con l'addebito sul conto del professionista e i soldi ancora bloccati
   * (`beforeRelease`) Stripe li riprende dal suo conto (`reverse_transfer`) e
   * la piattaforma restituisce la parte di trattenuta che supera quanto resta
   * pagato, così il suo conto non va mai in negativo: con un rimborso totale
   * il costo della carta resta a carico della piattaforma, come prima.
   */
  private async refundAcrossPayments(jobPaymentId: string, amountEurCents: number, reason: string, opts: { beforeRelease: boolean }): Promise<void> {
    const stripe = this.requireStripe();
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    const fromProfessional = !!jp.stripeDestinationAccountId && opts.beforeRelease;
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
        {
          payment_intent: pi,
          amount: part,
          ...(fromProfessional && intent.transfer_data?.destination ? { reverse_transfer: true } : {}),
          metadata: { jobPaymentId, reason: reason.slice(0, 450) },
        },
        { idempotencyKey: `job-refund-${pi}-${charge?.amount_refunded ?? 0}-${part}` },
      );
      remaining -= part;
    }
    const refunded = amountEurCents - remaining;
    const after = await this.prisma.jobPayment.update({ where: { id: jobPaymentId }, data: { refundedEurCents: { increment: refunded } } });
    if (fromProfessional) await this.keepProfessionalBalancePositive(after);
  }

  /**
   * Dopo un rimborso o una contestazione persa la trattenuta della
   * piattaforma non può superare quanto resta pagato: l'eccesso torna al
   * professionista, altrimenti il suo conto Stripe andrebbe in negativo.
   */
  private async keepProfessionalBalancePositive(jp: { id: string; paidEurCents: number; refundedEurCents: number; applicationFeeEurCents: number }): Promise<void> {
    const extra = jp.applicationFeeEurCents - Math.max(0, jp.paidEurCents - jp.refundedEurCents);
    if (extra > 0) await this.returnApplicationFee(jp.id, extra, "Rimborso al cliente: trattenuta restituita.");
  }

  /** Riprende dal conto del professionista una cifra persa (contestazione), poi sistema la trattenuta. */
  private async recoverFromProfessional(jobPaymentId: string, amountEurCents: number, tag: string): Promise<void> {
    await this.reverseFromProfessional(jobPaymentId, amountEurCents, tag);
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    await this.keepProfessionalBalancePositive(jp);
  }

  /**
   * Storno dal conto del professionista sui trasferimenti degli addebiti a
   * destinazione (prima il saldo, poi l'acconto). Restituisce quanto stornato.
   */
  private async reverseFromProfessional(jobPaymentId: string, amountEurCents: number, tag: string): Promise<number> {
    const stripe = this.requireStripe();
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    let remaining = amountEurCents;
    for (const pi of [jp.balancePaymentIntentId, jp.stripePaymentIntentId]) {
      if (!pi || remaining <= 0) continue;
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge.transfer"] });
      const transfer = (intent.latest_charge as Stripe.Charge | null)?.transfer as Stripe.Transfer | null | undefined;
      if (!transfer || typeof transfer === "string") continue;
      const part = Math.min(remaining, transfer.amount - transfer.amount_reversed);
      if (part <= 0) continue;
      await stripe.transfers.createReversal(
        transfer.id,
        { amount: part, metadata: { jobPaymentId } },
        { idempotencyKey: `job-reversal-${transfer.id}-${tag}-${transfer.amount_reversed}-${part}` },
      );
      remaining -= part;
    }
    return amountEurCents - remaining;
  }

  /**
   * Restituisce al professionista parte della trattenuta della piattaforma
   * (rimborso dell'application fee sul suo conto Stripe), spalmata sui due
   * pagamenti. Restituisce quanto restituito.
   */
  private async returnApplicationFee(jobPaymentId: string, amountEurCents: number, reason: string): Promise<number> {
    const stripe = this.requireStripe();
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    let remaining = Math.min(amountEurCents, jp.applicationFeeEurCents);
    for (const pi of [jp.balancePaymentIntentId, jp.stripePaymentIntentId]) {
      if (!pi || remaining <= 0) continue;
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge.application_fee"] });
      const fee = (intent.latest_charge as Stripe.Charge | null)?.application_fee as Stripe.ApplicationFee | null | undefined;
      if (!fee || typeof fee === "string") continue;
      const part = Math.min(remaining, fee.amount - fee.amount_refunded);
      if (part <= 0) continue;
      await stripe.applicationFees.createRefund(
        fee.id,
        { amount: part, metadata: { jobPaymentId, reason: reason.slice(0, 450) } },
        { idempotencyKey: `job-fee-return-${fee.id}-${fee.amount_refunded}-${part}` },
      );
      remaining -= part;
    }
    const returned = Math.min(amountEurCents, jp.applicationFeeEurCents) - remaining;
    if (returned > 0) await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { applicationFeeEurCents: { decrement: returned } } });
    return returned;
  }
}
