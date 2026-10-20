import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import {
  accountDebitGrossEurCents,
  connectFeeMonth,
  connectFeesForReleaseEurCents,
  connectPayoutFeeEurCents,
  estimatedCardFeeEurCents,
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

// Motivi di contestazione in banca che dipendono dal lavoro (non arrivato o
// non conforme): persa, anche la commissione di Stripe è a carico del
// professionista (§260). Frode, doppio addebito e simili restano a noi.
const PROFESSIONAL_FAULT_DISPUTE_REASONS = ["product_not_received", "product_unacceptable"];
// Commissione di Stripe su una contestazione se non si legge dall'evento.
const STRIPE_DISPUTE_FEE_EUR_CENTS = 2000;

// Il bonifico non riuscito si riprova una volta al giorno (dati bancari da sistemare).
const PAYOUT_RETRY_AFTER_FAILURE_MS = DAY_MS;

/** Dati di un addebito Stripe utili al flusso dei soldi. */
type ChargeInfo = {
  fee: number;
  chargeId: string | null;
  /** Conto Stripe del professionista se l'addebito è sul suo conto (a destinazione §249 o diretto §261). */
  destination: string | null;
  /** Addebito nato direttamente sul conto del professionista (§261). */
  direct: boolean;
  /** Trattenuta della piattaforma (application fee) sull'addebito. */
  applicationFeeAmount: number;
  /** Carta salvata per addebitare da sola il saldo (§260), se il cliente l'ha salvata. */
  savedCard: { customerId: string; paymentMethodId: string } | null;
};

/**
 * Salvataggio della carta all'acconto, per addebitare il saldo da solo alla
 * chiusura del lavoro (decisione dell'utente, §260). Solo quando anche il
 * saldo si paga online.
 */
function saveCardForBalance(enabled: boolean) {
  if (!enabled) return { session: {}, intent: {} };
  return {
    session: {
      customer_creation: "always" as const,
      custom_text: { submit: { message: "Il saldo verrà addebitato su questa carta quando il professionista chiude il lavoro, entro l'importo massimo del preventivo." } },
    },
    intent: { setup_future_usage: "off_session" as const },
  };
}

/** Opzioni Stripe per operare sul conto del professionista (addebito diretto, §261). */
function onAccount(stripeAccount: string | null | undefined): Stripe.RequestOptions {
  return stripeAccount ? { stripeAccount } : {};
}

/** Conto su cui è nato un pagamento del lavoro: quello del professionista con l'addebito diretto, altrimenti la piattaforma. */
function chargeAccount(jp: { stripeDirectCharge: boolean; stripeDestinationAccountId: string | null }): string | null {
  return jp.stripeDirectCharge ? jp.stripeDestinationAccountId : null;
}

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
 * Soldi dei pagamenti online dei lavori (docs/CHANGELOG.md §168, §249, §261):
 * acconto e saldo pagati dal cliente con Stripe Checkout e addebitati
 * direttamente sul conto Stripe del professionista (direct charges di Stripe
 * Connect, header Stripe-Account, decisione dell'utente del 20/10/2026), mai
 * in custodia sul conto della piattaforma (decisione del 14/10/2026). Così
 * Stripe prende rimborsi e contestazioni dal saldo del professionista, non
 * dal nostro; se va in negativo li preleva dalla sua banca. La piattaforma
 * trattiene commissione e costo della carta come application fee. I bonifici dal conto Stripe del
 * professionista alla sua banca sono manuali: i soldi restano bloccati lì
 * finché il cliente non conferma il lavoro o per 7 giorni dalla chiusura
 * (Stripe li paga comunque dopo 90 giorni), poi il sito fa partire il
 * bonifico. Rimborsi al cliente (annullamenti, segnalazioni accolte,
 * differenza pagata in più) ripresi dal conto del professionista.
 *
 * I pagamenti registrati prima seguono il loro modello fino alla fine:
 * addebito a destinazione (§249, `stripeDirectCharge` false) o, con
 * `stripeDestinationAccountId` vuoto, custodia sulla piattaforma e
 * trasferimento allo sblocco.
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
    // Un acconto già pagato con un modello precedente (custodia sulla
    // piattaforma o addebito a destinazione) tiene lo stesso modello anche
    // per il saldo: un lavoro non mescola i modelli.
    const legacy = jp.paidEurCents > 0 && !jp.stripeDestinationAccountId;
    const viaDestination = jp.paidEurCents > 0 && !!jp.stripeDestinationAccountId && !jp.stripeDirectCharge;
    const account = legacy ? null : await this.professionalAccount(booking.professionalProfileId, { direct: !viaDestination });
    const direct = !!account && !viaDestination;
    const saveCard = saveCardForBalance(part === "deposit" && !jp.balanceDirect && !!account);
    const metadata = { kind: "job_payment", part, jobPaymentId: jp.id, bookingId, ...(direct ? { stripeAccount: account } : {}) };
    const session = await this.requireStripe().checkout.sessions.create({
      mode: "payment",
      ...saveCard.session,
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
        ...(direct ? this.directChargeData(amount) : account ? { ...this.destinationChargeData(account, amount), transfer_group: bookingId } : { transfer_group: bookingId }),
        ...saveCard.intent,
        // Nome del professionista sull'estratto conto del cliente (docs/CHANGELOG.md §238): meno contestazioni "non riconosco l'addebito".
        ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
        metadata,
      },
      success_url: `${back}&pagamento=completato`,
      cancel_url: back,
      metadata,
    }, onAccount(direct ? account : null));
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
    const account = await this.professionalAccount(params.professionalProfileId, { direct: true });
    const metadata = { kind: "quote_deposit", quoteId: params.quoteId, clientUserId: params.clientUserId, paymentMethod: params.paymentMethod, stripeAccount: account };
    // Col saldo online la carta resta salvata per il saldo (§260); col saldo diretto (MIXED) no.
    const saveCard = saveCardForBalance(params.paymentMethod === "ONLINE");
    const session = await this.requireStripe().checkout.sessions.create({
      mode: "payment",
      ...saveCard.session,
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
        ...this.directChargeData(params.amountEurCents),
        ...saveCard.intent,
        ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
        metadata,
      },
      success_url: `${back}&pagamento=completato`,
      cancel_url: back,
      metadata,
    }, onAccount(account));
    return { url: session.url };
  }

  /**
   * Conto Stripe del professionista su cui addebitare un pagamento online
   * (docs/CHANGELOG.md §249, §261): deve poter accettare le carte (addebito
   * diretto) o ricevere trasferimenti (saldo di un lavoro iniziato con
   * l'addebito a destinazione), avere i bonifici verso la banca in manuale,
   * altrimenti Stripe li manderebbe subito alla sua banca e non sarebbero più
   * bloccati, e il saldo negativo coperto dalla sua banca. Se qualcosa manca
   * il pagamento non parte: meglio un errore chiaro che soldi non bloccati.
   */
  private async professionalAccount(professionalProfileId: string, opts: { direct: boolean }): Promise<string> {
    const stripe = this.requireStripe();
    const unavailable = "Il professionista non può ricevere pagamenti online in questo momento. Riprova più tardi o, se il preventivo lo prevede, scegli il pagamento diretto.";
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({
      where: { professionalProfileId },
      select: { id: true, stripeConnectAccountId: true, stripePayoutsEnabled: true, stripeManualPayoutsAt: true, stripeNegativeDebitAt: true },
    });
    const accountId = fiscal?.stripeConnectAccountId;
    if (!fiscal || !accountId || !(await this.accountActive(accountId, fiscal.stripePayoutsEnabled, opts.direct ? "cards" : "transfers"))) {
      throw new BadRequestException(unavailable);
    }
    if (!fiscal.stripeManualPayoutsAt || !fiscal.stripeNegativeDebitAt) {
      try {
        await stripe.balanceSettings.update(
          { payments: { payouts: { schedule: { interval: "manual" } }, debit_negative_balances: true } },
          { stripeAccount: accountId },
        );
      } catch (err) {
        this.logger.error(`Impostazioni del saldo non salvate per ${accountId}: ${(err as Error).message}`);
        throw new BadRequestException(unavailable);
      }
      const now = new Date();
      await this.prisma.professionalFiscalProfile.update({
        where: { id: fiscal.id },
        data: { stripeManualPayoutsAt: fiscal.stripeManualPayoutsAt ?? now, stripeNegativeDebitAt: now },
      });
      await this.auditLogService.record({
        entityType: "ProfessionalFiscalProfile",
        entityId: fiscal.id,
        fieldName: "stripeManualPayoutsAt",
        newValue: { payouts: "manual", debitNegativeBalances: true },
        reason: "Bonifici verso la banca in manuale (soldi dei lavori bloccati fino allo sblocco) e saldo negativo coperto dalla sua banca.",
      });
    }
    return accountId;
  }

  /** Addebito diretto sul conto del professionista con la trattenuta della piattaforma (§261). */
  private directChargeData(amountEurCents: number) {
    return { application_fee_amount: onlineApplicationFeeHoldEurCents(amountEurCents) };
  }

  /** Addebito a destinazione (§249), solo per il saldo dei lavori iniziati così. */
  private destinationChargeData(destination: string, amountEurCents: number) {
    return { transfer_data: { destination }, application_fee_amount: onlineApplicationFeeHoldEurCents(amountEurCents) };
  }

  /**
   * Acconto pagato su un preventivo che non si può più confermare: torna
   * tutto al cliente. `stripeAccount`: il conto del professionista su cui è
   * nato il pagamento (addebito diretto, §261).
   */
  async refundQuoteDeposit(
    paymentIntentId: string,
    reason: string,
    stripeAccount?: string | null,
    notifyTo?: { clientUserId: string; guidedRequestId: string | null },
  ): Promise<{ pending: boolean }> {
    const stripe = this.requireStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {}, onAccount(stripeAccount));
    // Addebito sul conto del professionista: si riprende da lì e la
    // piattaforma restituisce anche la sua trattenuta.
    const destination = !!intent.transfer_data?.destination;
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(stripeAccount ? { refund_application_fee: true } : destination ? { reverse_transfer: true, refund_application_fee: true } : {}),
        metadata: { reason: reason.slice(0, 450) },
      },
      { idempotencyKey: `quote-deposit-refund-${paymentIntentId}`, ...onAccount(stripeAccount) },
    );
    this.logger.warn(`Acconto ${paymentIntentId} rimborsato: ${reason}`);
    const pending = !!stripeAccount && refund.status === "pending";
    if (pending && notifyTo) {
      await this.markRefundWaiting([refund], stripeAccount, { clientUserId: notifyTo.clientUserId, guidedRequestId: notifyTo.guidedRequestId, bookingId: null });
    }
    return { pending };
  }

  /**
   * Rimborso su un addebito diretto rimasto in attesa (§262): il saldo
   * Stripe del professionista non basta e Stripe lo completa appena
   * arrivano i fondi. Si segna sul rimborso chi avvisare, così il webhook
   * `refund.updated` può dire al cliente che è arrivato.
   */
  private async markRefundWaiting(
    refunds: Stripe.Refund[],
    stripeAccount: string,
    who: { clientUserId: string; guidedRequestId: string | null; bookingId: string | null },
  ): Promise<void> {
    const stripe = this.requireStripe();
    for (const refund of refunds) {
      await stripe.refunds.update(
        refund.id,
        {
          metadata: {
            waitingFunds: "true",
            clientUserId: who.clientUserId,
            ...(who.guidedRequestId ? { guidedRequestId: who.guidedRequestId } : {}),
            ...(who.bookingId ? { bookingId: who.bookingId } : {}),
          },
        },
        onAccount(stripeAccount),
      );
    }
    this.logger.warn(`Rimborso in attesa di fondi sul conto ${stripeAccount}: ${refunds.map((r) => r.id).join(", ")}`);
  }

  /**
   * Webhook `refund.updated` / `refund.failed` dal conto del professionista
   * (§262): un rimborso rimasto in attesa è arrivato al cliente, oppure non
   * è riuscito e serve il nostro team. Idempotente: dopo l'avviso il
   * rimborso non è più segnato come in attesa.
   */
  async handleRefundUpdated(refund: Stripe.Refund, stripeAccount: string | null | undefined): Promise<void> {
    if (!stripeAccount || refund.metadata?.waitingFunds !== "true") return;
    if (refund.status !== "succeeded" && refund.status !== "failed" && refund.status !== "canceled") return;
    const ok = refund.status === "succeeded";
    await this.requireStripe().refunds.update(refund.id, { metadata: { waitingFunds: ok ? "done" : "failed" } }, onAccount(stripeAccount));
    const clientUserId = refund.metadata.clientUserId;
    const payload = {
      bookingId: refund.metadata.bookingId ?? null,
      guidedRequestId: refund.metadata.guidedRequestId ?? null,
      amountEurCents: refund.amount,
    };
    if (ok) {
      if (clientUserId) await this.notificationsService.notify(clientUserId, "JOB_REFUND_COMPLETED", { ...payload, audience: "CLIENT" });
      return;
    }
    await this.notifyFinanceAdmins("ADMIN_JOB_REFUND_FAILED", payload);
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
    await this.recordPayment(jobPaymentId, part, paymentIntentId, session.amount_total ?? 0, { ...opts, stripeAccount: session.metadata?.stripeAccount ?? null });
  }

  /** Registra un acconto o saldo riuscito (da Checkout o addebitato sulla carta salvata). Idempotente sul payment intent. */
  private async recordPayment(
    jobPaymentId: string,
    part: "deposit" | "balance",
    paymentIntentId: string,
    amount: number,
    opts: { notify: boolean; autoCharged?: boolean; stripeAccount?: string | null },
  ): Promise<void> {
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId }, include: { booking: true } });
    if (!jp) return;
    if (jp.stripePaymentIntentId === paymentIntentId || jp.balancePaymentIntentId === paymentIntentId) return;
    // Saldo automatico: lo registrano sia l'addebito sia il webhook, solo il primo che arriva.
    if (opts.autoCharged) {
      const claimed = await this.prisma.jobPayment.updateMany({ where: { id: jp.id, balanceAutoChargedAt: null }, data: { balanceAutoChargedAt: new Date() } });
      if (claimed.count === 0) return;
    }

    const charge = await this.chargeOf(paymentIntentId, opts.stripeAccount ?? null);

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
          ? {
              stripeDestinationAccountId: charge.destination,
              applicationFeeEurCents: jp.applicationFeeEurCents + charge.applicationFeeAmount,
              ...(charge.direct ? { stripeDirectCharge: true } : {}),
            }
          : {}),
        ...(part === "deposit" && charge.savedCard
          ? { clientStripeCustomerId: charge.savedCard.customerId, savedPaymentMethodId: charge.savedCard.paymentMethodId }
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
      newValue: { amountEurCents: amount, stripeFeeEurCents: charge.fee, stage, destination: charge.destination, direct: charge.direct, applicationFeeEurCents: charge.applicationFeeAmount },
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
    let connectFees = 0;
    if (charge.destination) {
      // I soldi sono già sul conto del professionista: la piattaforma tiene
      // commissione, costo della carta e costo del bonifico (§260) e il resto
      // parte subito verso la banca.
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: { balancePaymentIntentId: paymentIntentId, applicationFeeEurCents: { increment: charge.applicationFeeAmount } },
      });
      const toBank = Math.max(0, amount - appFee - charge.fee);
      const extra = charge.applicationFeeAmount - (appFee + charge.fee + connectPayoutFeeEurCents(toBank));
      const returned = extra > 0 ? await this.returnApplicationFee(jp.id, extra, "Conguaglio del saldo pagato in ritardo.") : 0;
      held = charge.applicationFeeAmount - returned;
      connectFees = Math.max(0, Math.min(connectPayoutFeeEurCents(toBank), held - appFee - charge.fee));
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
    const platformFee = charge.destination ? Math.max(0, held - charge.fee - connectFees) : appFee;
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: {
        balancePaymentIntentId: paymentIntentId,
        balancePaidAt: new Date(),
        paidEurCents: { increment: amount },
        stripeFeeEurCents: { increment: charge.fee },
        platformFeeEurCents: { increment: platformFee },
        netAmountEurCents: { increment: payout },
        ...(charge.destination ? { payoutPendingEurCents: { increment: payout }, connectFeesEurCents: { increment: connectFees } } : {}),
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
   * Costo Stripe del pagamento, id dell'addebito e, per gli addebiti sul
   * conto del professionista, quel conto e la trattenuta della piattaforma.
   * Con l'addebito diretto (`stripeAccount`, §261) il costo della carta
   * Stripe lo fa pagare alla piattaforma senza dettaglio per pagamento: si
   * stima dal listino in base alla carta. Negli altri casi è quello reale
   * della balance transaction (0 se non disponibile).
   */
  private async chargeOf(paymentIntentId: string, stripeAccount: string | null): Promise<ChargeInfo> {
    const empty: ChargeInfo = { fee: 0, chargeId: null, destination: null, direct: false, applicationFeeAmount: 0, savedCard: null };
    if (!this.stripe) return empty;
    let pi: Stripe.PaymentIntent;
    try {
      pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] }, onAccount(stripeAccount));
    } catch (err) {
      this.logger.warn(`Costo Stripe non letto per ${paymentIntentId}: ${(err as Error).message}`);
      return empty;
    }
    const charge = pi.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    const destination = stripeAccount ?? idOf(pi.transfer_data?.destination ?? charge?.transfer_data?.destination ?? null);
    const customerId = idOf(pi.customer);
    const paymentMethodId = idOf(pi.payment_method);
    const card = charge?.payment_method_details?.card;
    return {
      fee: stripeAccount
        ? estimatedCardFeeEurCents(charge?.amount ?? pi.amount, card ? { country: card.country, regulatedStatus: card.regulated_status } : null)
        : (bt?.fee ?? 0),
      chargeId: charge?.id ?? null,
      destination,
      direct: !!stripeAccount,
      applicationFeeAmount: destination ? (charge?.application_fee_amount ?? pi.application_fee_amount ?? 0) : 0,
      savedCard: pi.setup_future_usage === "off_session" && customerId && paymentMethodId ? { customerId, paymentMethodId } : null,
    };
  }

  /**
   * Dopo la chiusura del lavoro (importo finale noto): fase del saldo e data
   * in cui i soldi passano al professionista se il cliente non conferma.
   */
  async afterCompletion(
    jobPaymentId: string,
    finalAmountEurCents: number,
    appFeeEurCents: number,
    opts: { autoCharge?: boolean } = {},
  ): Promise<{ balanceDueEurCents: number; autoChargedEurCents: number }> {
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
    // Saldo addebitato da solo sulla carta salvata con l'acconto (§260):
    // solo se l'importo finale resta nel preventivo accettato dal cliente.
    if (due > 0 && opts.autoCharge && (await this.chargeSavedCard(jp.id, due))) return { balanceDueEurCents: 0, autoChargedEurCents: due };
    return { balanceDueEurCents: due, autoChargedEurCents: 0 };
  }

  /**
   * Addebito del saldo sulla carta salvata con l'acconto, senza il cliente
   * presente (off-session). Se la banca lo rifiuta o chiede di confermare,
   * il cliente paga con il link come prima. Restituisce true se è riuscito.
   */
  private async chargeSavedCard(jobPaymentId: string, amount: number): Promise<boolean> {
    if (!this.stripe) return false;
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({
      where: { id: jobPaymentId },
      include: { booking: { select: { clientId: true, professionalProfile: { select: { businessName: true } }, quote: { select: { guidedRequestId: true } } } } },
    });
    if (!jp.clientStripeCustomerId || !jp.savedPaymentMethodId || !jp.stripeDestinationAccountId || jp.balanceDirect || jp.balancePaymentIntentId) return false;
    const suffix = statementSuffix(jp.booking.professionalProfile.businessName);
    // Con l'addebito diretto (§261) cliente e carta stanno sul conto del professionista.
    const account = chargeAccount(jp);
    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.stripe.paymentIntents.create(
        {
          amount,
          currency: "eur",
          customer: jp.clientStripeCustomerId,
          payment_method: jp.savedPaymentMethodId,
          off_session: true,
          confirm: true,
          description: `Saldo del lavoro con ${jp.booking.professionalProfile.businessName}`,
          ...(account ? this.directChargeData(amount) : { ...this.destinationChargeData(jp.stripeDestinationAccountId, amount), transfer_group: jp.bookingId }),
          ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
          metadata: { kind: "job_payment", part: "balance", auto: "true", jobPaymentId: jp.id, bookingId: jp.bookingId, ...(account ? { stripeAccount: account } : {}) },
        },
        { idempotencyKey: `job-auto-balance-${jp.id}-${jp.paidEurCents}-${amount}`, ...onAccount(account) },
      );
    } catch (err) {
      this.logger.warn(`Saldo automatico non riuscito per ${jp.id}: ${(err as Error).message}`);
      await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { balanceAutoChargeFailedAt: new Date() } });
      return false;
    }
    if (intent.status !== "succeeded") {
      // Pagamento in sospeso o da confermare: il webhook lo registra se riesce, intanto vale il link.
      if (intent.status !== "processing") await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { balanceAutoChargeFailedAt: new Date() } });
      return false;
    }
    await this.recordPayment(jp.id, "balance", intent.id, intent.amount, { notify: true, autoCharged: true, stripeAccount: account });
    await this.notificationsService.notify(jp.booking.clientId, "JOB_BALANCE_AUTO_CHARGED", {
      bookingId: jp.bookingId,
      guidedRequestId: jp.booking.quote?.guidedRequestId ?? null,
      amountEurCents: intent.amount,
      audience: "CLIENT",
    });
    return true;
  }

  /**
   * Webhook `payment_intent.succeeded` di un saldo addebitato sulla carta
   * salvata (§260): rete di sicurezza se la registrazione subito dopo
   * l'addebito non è andata a buon fine. Idempotente.
   */
  async handleAutoBalanceSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
    if (intent.metadata?.kind !== "job_payment" || intent.metadata?.auto !== "true" || !intent.metadata.jobPaymentId) return;
    await this.recordPayment(intent.metadata.jobPaymentId, "balance", intent.id, intent.amount, {
      notify: true,
      autoCharged: true,
      stripeAccount: intent.metadata.stripeAccount ?? null,
    });
  }

  /**
   * Sblocca i soldi al professionista se è il momento (conferma del cliente o
   * 7 giorni, nessuna segnalazione né contestazione aperta). Con l'addebito
   * sul suo conto (§249) restituisce il conguaglio della trattenuta e fa
   * partire il bonifico verso la sua banca; col vecchio modello trasferisce
   * dal conto della piattaforma.
   */
  async releaseIfDue(jobPaymentId: string, now: Date = new Date()): Promise<boolean> {
    const jp = await this.prisma.jobPayment.findUnique({
      where: { id: jobPaymentId },
      include: {
        booking: {
          include: {
            issue: { select: { status: true, appealedAt: true, appealDecision: true, refundPercent: true } },
            professionalProfile: { select: { id: true, userId: true, fiscalProfile: { select: { stripeConnectAccountId: true, stripePayoutsEnabled: true } } } },
            quote: { select: { guidedRequestId: true } },
          },
        },
      },
    });
    if (!jp || jp.paymentMethod !== "MANOVIA" || jp.releasedAt) return false;
    const booking = jp.booking;
    const issue = booking.issue;
    // Segnalazione accolta con rimborso parziale (§260): eseguito il rimborso,
    // il resto passa al professionista. Con il rimborso totale o ancora da
    // eseguire (in mano alla Finanza) i soldi restano bloccati.
    const partialRefundDone =
      issue?.status === "UPHELD" &&
      issue.refundPercent !== null &&
      issue.refundPercent < 100 &&
      (await this.prisma.refund.count({ where: { jobPaymentId: jp.id, status: { in: ["REQUESTED", "APPROVED"] } } })) === 0;
    const issueOpen = !!issue && (OPEN_ISSUE_STATUSES.includes(issue.status) || (issue.status === "UPHELD" && !partialRefundDone));
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
    // Contestazione vinta ma cifra non ancora restituita da Stripe: si sblocca al suo ritorno (§260).
    if (jp.disputeRecoveredEurCents > 0) return false;

    // Col vecchio modello i soldi sono sulla piattaforma e serve un conto
    // Stripe attivo per trasferirli. Con l'addebito sul conto del
    // professionista sono già lì: manca solo il bonifico.
    const destinationModel = !!jp.stripeDestinationAccountId;
    const account = booking.professionalProfile.fiscalProfile;
    if (!destinationModel) {
      const transfersActive = account?.stripeConnectAccountId ? await this.accountActive(account.stripeConnectAccountId, account.stripePayoutsEnabled, "transfers") : false;
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
      // Commissione sul totale del lavoro anche con una parte rimborsata al
      // cliente (decisione dell'utente, §260); col saldo non pagato solo su
      // quanto incassato.
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
      let connectFees = 0;
      let debtRecovered = 0;
      // Parte già presa da Stripe dal suo saldo per rimborsi o contestazioni di altri lavori (§261).
      let takenByStripe = 0;
      let monthlyFeeMonth: string | null = null;
      if (destinationModel) {
        // Il professionista ha già tutto sul suo conto meno la trattenuta: la
        // piattaforma tiene solo commissione e costo della carta e restituisce
        // il resto. Se la trattenuta fosse più bassa (regola di commissione
        // più alta del 5%), la differenza resta a carico della piattaforma.
        const fresh = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } });
        const collected = fresh.paidEurCents - fresh.refundedEurCents;
        const keep = Math.max(0, collected - payout);
        const extra = fresh.applicationFeeEurCents - keep;
        if (extra < 0) this.logger.warn(`Trattenuta di ${jp.id} più bassa del dovuto di ${-extra} centesimi.`);
        let gross = Math.max(0, collected - Math.min(fresh.applicationFeeEurCents, keep));
        // Con l'addebito diretto (§261) Stripe prende rimborsi e
        // contestazioni dal saldo del professionista anche oltre i soldi del
        // lavoro interessato, cioè da quelli ancora bloccati per altri: il
        // bonifico non supera quanto resta davvero sul conto, tolto ciò che
        // serve agli altri lavori.
        if (fresh.stripeDirectCharge && fresh.stripeDestinationAccountId) {
          const free = await this.unreservedBalance(fresh.stripeDestinationAccountId, fresh.id);
          takenByStripe = Math.max(0, gross - free);
          gross -= takenByStripe;
        }
        // Prima del bonifico si riprendono (§260) quanto il professionista ci
        // deve per lavori precedenti (rimborsi o contestazioni dopo il
        // bonifico) e i costi di Stripe Connect: bonifico e quota mensile.
        const debts = await this.professionalDebts(booking.professionalProfile.id);
        const debtTake = Math.min(
          debts.reduce((sum, d) => sum + d.professionalDebtEurCents, 0),
          gross,
        );
        const month = connectFeeMonth(now);
        const monthlyDone =
          (await this.prisma.jobPayment.count({ where: { booking: { professionalProfileId: booking.professionalProfile.id }, connectMonthlyFeeMonth: month } })) > 0;
        const fees = connectFeesForReleaseEurCents(gross - debtTake, !monthlyDone);
        const toTake = debtTake + fees;
        // Si tiene prima dalla parte di trattenuta da restituire, poi si
        // storna dal conto del professionista. Lo storno va prima della
        // restituzione: se non riesce, nessun soldo si è ancora mosso.
        const retained = Math.min(Math.max(0, extra), toTake);
        const reversed = toTake - retained > 0 ? await this.reverseFromProfessional(jp.id, toTake - retained, "release") : 0;
        if (extra - retained > 0) await this.returnApplicationFee(jp.id, extra - retained, "Conguaglio allo sblocco.");
        const taken = retained + reversed;
        connectFees = Math.min(fees, taken);
        debtRecovered = taken - connectFees;
        if (!monthlyDone && connectFees > 0) monthlyFeeMonth = month;
        netPayout = gross - taken;
      } else if (payout > 0) {
        transfer = await stripe.transfers.create(
          { amount: payout, currency: "eur", destination: account!.stripeConnectAccountId!, transfer_group: booking.id },
          { idempotencyKey: `job-release-${jp.id}` },
        );
      }
      moneyMoved = true;
      if (debtRecovered > 0) await this.settleDebts(booking.professionalProfile.id, debtRecovered, jp.id);
      const after = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } });
      const appFee = after.paidEurCents - after.refundedEurCents - netPayout - after.stripeFeeEurCents - connectFees - debtRecovered - takenByStripe;
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: {
          onlineStage: "RELEASED",
          status: "CONFIRMED",
          stripeTransferId: transfer?.id ?? null,
          netAmountEurCents: netPayout,
          platformFeeEurCents: Math.max(0, appFee),
          ...(destinationModel ? { payoutPendingEurCents: netPayout, connectFeesEurCents: { increment: connectFees } } : {}),
          ...(monthlyFeeMonth ? { connectMonthlyFeeMonth: monthlyFeeMonth } : {}),
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
        newValue: {
          stage: "RELEASED",
          payout: netPayout,
          refundToClient,
          balanceUnpaid,
          transferId: transfer?.id ?? null,
          destination: jp.stripeDestinationAccountId,
          connectFees,
          debtRecovered,
          takenByStripe,
        },
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
        connectFeesEurCents: connectFees,
        debtRecoveredEurCents: debtRecovered,
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
   * sbloccato (docs/CHANGELOG.md §249). Parte solo se sul conto ci sono
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

    const funds = await this.accountFunds(accountId, jp.id);
    if (Math.min(funds.available, funds.free) < amount) return false;

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

  /**
   * Soldi sul conto Stripe del professionista: disponibili ora e liberi,
   * cioè disponibili più in arrivo meno quelli che devono restare sul conto
   * per gli altri lavori (ancora bloccati, tolti quelli già presi per una
   * contestazione in banca, o sbloccati col bonifico in attesa).
   */
  private async accountFunds(accountId: string, excludeJobPaymentId: string): Promise<{ available: number; free: number }> {
    const balance = await this.requireStripe().balance.retrieve({}, { stripeAccount: accountId });
    const available = eurAmount(balance.available);
    const incoming = eurAmount(balance.pending);
    const others = await this.prisma.jobPayment.findMany({
      where: {
        stripeDestinationAccountId: accountId,
        id: { not: excludeJobPaymentId },
        OR: [{ releasedAt: null, onlineStage: { notIn: ["REFUNDED", "AWAITING_DEPOSIT"] } }, { payoutPendingEurCents: { gt: 0 } }],
      },
      select: { releasedAt: true, paidEurCents: true, refundedEurCents: true, applicationFeeEurCents: true, payoutPendingEurCents: true, disputeRecoveredEurCents: true },
    });
    const reserved = others.reduce(
      (sum, o) =>
        sum +
        (o.releasedAt ? o.payoutPendingEurCents : Math.max(0, o.paidEurCents - o.refundedEurCents - o.applicationFeeEurCents - o.disputeRecoveredEurCents)),
      0,
    );
    return { available, free: available + incoming - reserved };
  }

  /** Quanto si può sbloccare per un lavoro senza toccare i soldi degli altri (§261). Se Stripe non risponde, nessun limite. */
  private async unreservedBalance(accountId: string, jobPaymentId: string): Promise<number> {
    try {
      return Math.max(0, (await this.accountFunds(accountId, jobPaymentId)).free);
    } catch (err) {
      this.logger.warn(`Saldo Stripe non letto per ${accountId}: ${(err as Error).message}`);
      return Number.MAX_SAFE_INTEGER;
    }
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
   * disponibili i suoi soldi (`skipFailed`: solo quelli in attesa, §249).
   */
  async retryPayoutsForAccount(accountId: string, options: { skipFailed?: boolean } = {}): Promise<void> {
    const rows = await this.prisma.jobPayment.findMany({
      where: { stripeDestinationAccountId: accountId, payoutPendingEurCents: { gt: 0 }, ...(options.skipFailed ? { payoutFailedAt: null } : {}) },
      select: { id: true },
    });
    for (const row of rows) await this.sendPayout(row.id).catch((err) => this.logger.warn(`Bonifico rimandato per ${row.id}: ${(err as Error).message}`));
  }

  /**
   * Prima di ogni pagamento o trasferimento si rilegge da Stripe se l'account
   * del professionista può accettare le carte (addebito diretto, §261) o
   * ricevere trasferimenti (modelli precedenti), buona pratica Stripe
   * (docs/CHANGELOG.md §236): il webhook può essere in ritardo o non
   * arrivare. Lo stato salvato è quello delle carte. Se Stripe non risponde
   * vale l'ultimo stato salvato.
   */
  private async accountActive(accountId: string, saved: boolean, kind: "cards" | "transfers"): Promise<boolean> {
    if (!this.stripe) return saved;
    try {
      const status = await readStripeConnectStatus(this.stripe, accountId);
      if (status.cardPaymentsActive !== saved) {
        await this.prisma.professionalFiscalProfile.updateMany({
          where: { stripeConnectAccountId: accountId },
          data: { stripeChargesEnabled: status.cardPaymentsActive, stripePayoutsEnabled: status.cardPaymentsActive, stripeRequirementsStatus: status.requirements },
        });
      }
      return kind === "cards" ? status.cardPaymentsActive : status.transfersActive;
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
    // Addebito sul conto del professionista (§249, §260): la cifra persa si
    // riprende dal suo conto, quello che non c'è più diventa un suo debito.
    let debtAdded = 0;
    if (justClosed && jp.stripeDestinationAccountId) {
      debtAdded = await this.settleClosedDispute(jp, dispute, lostAmount).catch((err) => {
        this.logger.error(`Contestazione chiusa ${dispute.id}: recupero dal conto del professionista non riuscito: ${(err as Error).message}`);
        return 0;
      });
    }
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "stripeDisputeStatus",
      oldValue: jp.stripeDisputeStatus,
      newValue: { disputeId: dispute.id, status: dispute.status, reason: dispute.reason, amountEurCents: dispute.amount, lostAmount, debtAdded },
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
        debtEurCents: debtAdded,
      };
      await this.notifyFinanceAdmins("ADMIN_STRIPE_DISPUTE", payload);
      await this.notificationsService.notify(jp.booking.professionalProfile.userId, "JOB_STRIPE_DISPUTE", payload);
    }
    // Contestazione vinta: se era il momento, l'accredito parte subito.
    if (justClosed && !lost) await this.releaseIfDue(jp.id).catch(() => false);
    return true;
  }

  /**
   * Soldi di una contestazione in banca (webhook
   * `charge.dispute.funds_withdrawn` / `funds_reinstated`, §260, §261).
   * Addebito diretto: Stripe prende la cifra dal saldo del professionista e
   * gliela rimette se si vince; qui si tiene solo il conto di quanto è
   * uscito dai soldi di questo lavoro. Addebito a destinazione: Stripe prende
   * cifra e commissione dal conto della piattaforma e la cifra si riprende
   * subito dai soldi del lavoro ancora bloccati sul conto del professionista,
   * così non la anticipiamo noi; se si vince torna a lui. Restituisce false
   * se il pagamento non è di un lavoro.
   */
  async handleStripeDisputeFunds(dispute: Stripe.Dispute, kind: "withdrawn" | "reinstated"): Promise<boolean> {
    if (!(await this.handleStripeDispute(dispute))) return false;
    const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    const jp = await this.prisma.jobPayment.findFirst({ where: { OR: [{ stripePaymentIntentId: paymentIntentId }, { balancePaymentIntentId: paymentIntentId }] } });
    if (!jp?.stripeDestinationAccountId || !this.stripe) return true;

    if (kind === "withdrawn") {
      if (jp.disputeRecoveredEurCents > 0 || CLOSED_DISPUTE_STATUSES.includes(dispute.status)) return true;
      // Solo i soldi ancora sul suo conto per questo lavoro: bloccati o sbloccati ma col bonifico non ancora partito.
      const frozen = jp.releasedAt ? jp.payoutPendingEurCents : Math.max(0, jp.paidEurCents - jp.refundedEurCents - jp.applicationFeeEurCents);
      const target = Math.min(dispute.amount, frozen);
      if (target <= 0) return true;
      const recovered = jp.stripeDirectCharge ? target : await this.reverseFromProfessional(jp.id, target, `dispute-${dispute.id}`);
      if (recovered <= 0) return true;
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: { disputeRecoveredEurCents: recovered, ...(jp.releasedAt ? { payoutPendingEurCents: { decrement: recovered } } : {}) },
      });
      await this.auditLogService.record({
        entityType: "JobPayment",
        entityId: jp.id,
        fieldName: "disputeRecoveredEurCents",
        newValue: { disputeId: dispute.id, recovered },
        reason: jp.stripeDirectCharge
          ? "Contestazione in banca: Stripe ha preso la cifra dal saldo del professionista."
          : "Contestazione in banca: cifra ripresa subito dai soldi bloccati del professionista.",
      });
      return true;
    }

    if (jp.stripeDirectCharge) {
      // Vinta: Stripe rimette tutta la cifra sul suo saldo. Dopo lo sblocco va
      // tutta nel bonifico, anche la parte presa dai soldi di altri lavori,
      // che in quel caso hanno avuto un bonifico più basso.
      if (jp.disputeRecoveredEurCents <= 0 && !jp.releasedAt) return true;
      const back = jp.releasedAt ? dispute.amount : jp.disputeRecoveredEurCents;
      const claimed = await this.prisma.jobPayment.updateMany({
        where: { id: jp.id, disputeReturnTransferId: null },
        data: { disputeRecoveredEurCents: 0, disputeReturnTransferId: `reinstated-${dispute.id}`, ...(jp.releasedAt ? { payoutPendingEurCents: { increment: back } } : {}) },
      });
      if (claimed.count === 0) return true;
      await this.auditLogService.record({
        entityType: "JobPayment",
        entityId: jp.id,
        fieldName: "disputeRecoveredEurCents",
        oldValue: jp.disputeRecoveredEurCents,
        newValue: { disputeId: dispute.id, reinstated: back },
        reason: "Contestazione in banca vinta: Stripe ha rimesso la cifra sul saldo del professionista.",
      });
      if (jp.releasedAt) await this.sendPayout(jp.id).catch((err) => this.logger.warn(`Bonifico rimandato per ${jp.id}: ${(err as Error).message}`));
      else await this.releaseIfDue(jp.id).catch(() => false);
      return true;
    }

    const amount = jp.disputeRecoveredEurCents;
    if (amount <= 0) return true;
    // Contestazione vinta: Stripe ha rimesso i soldi sul conto della piattaforma, tornano al professionista.
    const transfer = await this.stripe.transfers.create(
      { amount, currency: "eur", destination: jp.stripeDestinationAccountId, transfer_group: jp.bookingId, metadata: { jobPaymentId: jp.id, disputeId: dispute.id } },
      { idempotencyKey: `job-dispute-return-${dispute.id}` },
    );
    await this.prisma.jobPayment.update({
      where: { id: jp.id },
      data: { disputeRecoveredEurCents: 0, disputeReturnTransferId: transfer.id, ...(jp.releasedAt ? { payoutPendingEurCents: { increment: amount } } : {}) },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jp.id,
      fieldName: "disputeRecoveredEurCents",
      oldValue: amount,
      newValue: { disputeId: dispute.id, transferId: transfer.id },
      reason: "Contestazione in banca vinta: cifra restituita al professionista.",
    });
    if (jp.releasedAt) await this.sendPayout(jp.id).catch((err) => this.logger.warn(`Bonifico rimandato per ${jp.id}: ${(err as Error).message}`));
    else await this.releaseIfDue(jp.id).catch(() => false);
    return true;
  }

  /**
   * Contestazione chiusa su un addebito sul conto del professionista.
   * Addebito diretto (§261): persa, Stripe ha già preso la cifra dal suo
   * saldo; prima dello sblocco la trattenuta in più gli torna, dopo gli torna
   * la nostra parte (commissione e costi) se la colpa non è sua. Addebito a
   * destinazione: persa, si riprende
   * dal conto del professionista la sua parte non ancora ripresa
   * all'apertura (solo i soldi del lavoro ancora lì) e il resto diventa un
   * suo debito, recuperato dai lavori successivi (§260); se il motivo
   * dipende dal lavoro anche commissione di Stripe e costi del pagamento.
   * Restituisce il debito aggiunto.
   */
  private async settleClosedDispute(
    jp: {
      id: string;
      releasedAt: Date | null;
      disputeRecoveredEurCents: number;
      netAmountEurCents: number;
      payoutPendingEurCents: number;
      paidEurCents: number;
      refundedEurCents: number;
      platformFeeEurCents: number;
      stripeFeeEurCents: number;
      stripeDirectCharge: boolean;
    },
    dispute: Stripe.Dispute,
    lostAmount: number,
  ): Promise<number> {
    if (dispute.status !== "lost") return 0;
    const early = jp.disputeRecoveredEurCents;
    const fault = PROFESSIONAL_FAULT_DISPUTE_REASONS.includes(dispute.reason);
    let debt = 0;
    if (jp.stripeDirectCharge) {
      await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { disputeRecoveredEurCents: 0 } });
      if (!jp.releasedAt) {
        await this.keepProfessionalBalancePositive(await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } }));
        if (fault) debt += this.faultCostsEurCents(jp, lostAmount);
      } else {
        const proShare = Math.min(lostAmount, jp.netAmountEurCents);
        await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { netAmountEurCents: { decrement: proShare } } });
        if (!fault && lostAmount > proShare) await this.returnApplicationFee(jp.id, lostAmount - proShare, `Contestazione in banca persa (${dispute.id}): la nostra parte torna al professionista.`);
      }
      if (fault) debt += (dispute.balance_transactions ?? []).reduce((sum, bt) => sum + Math.max(0, bt.fee), 0) || STRIPE_DISPUTE_FEE_EUR_CENTS;
      if (debt > 0) await this.addProfessionalDebt(jp.id, debt, `Contestazione in banca persa (${dispute.id}).`);
      return debt;
    }
    if (!jp.releasedAt) {
      const rest = Math.max(0, lostAmount - early);
      const got = rest > 0 ? await this.reverseFromProfessional(jp.id, rest, `dispute-${dispute.id}`) : 0;
      debt += rest - got;
      await this.prisma.jobPayment.update({ where: { id: jp.id }, data: { disputeRecoveredEurCents: 0 } });
      await this.keepProfessionalBalancePositive(await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jp.id } }));
    } else {
      const proShare = Math.max(0, Math.min(lostAmount, jp.netAmountEurCents) - early);
      const fromPending = Math.min(proShare, jp.payoutPendingEurCents);
      const got = fromPending > 0 ? await this.reverseFromProfessional(jp.id, fromPending, `dispute-${dispute.id}`) : 0;
      debt += proShare - got;
      await this.prisma.jobPayment.update({
        where: { id: jp.id },
        data: { disputeRecoveredEurCents: 0, payoutPendingEurCents: { decrement: got }, netAmountEurCents: { decrement: got + early } },
      });
    }
    if (PROFESSIONAL_FAULT_DISPUTE_REASONS.includes(dispute.reason)) {
      const fee = (dispute.balance_transactions ?? []).reduce((sum, bt) => sum + Math.max(0, bt.fee), 0) || STRIPE_DISPUTE_FEE_EUR_CENTS;
      debt += fee + this.faultCostsEurCents(jp, lostAmount);
    }
    if (debt > 0) await this.addProfessionalDebt(jp.id, debt, `Contestazione in banca persa (${dispute.id}).`);
    return debt;
  }

  /**
   * Quello che la piattaforma rimetterebbe su una cifra rimborsata o persa
   * (costo della carta e del bonifico che Stripe non restituisce, e la nostra
   * commissione già trattenuta, che resta a noi: decisione dell'utente,
   * §260), da mettere a carico del professionista quando è colpa sua.
   */
  private faultCostsEurCents(
    jp: { releasedAt: Date | null; netAmountEurCents: number; paidEurCents: number; refundedEurCents: number; platformFeeEurCents: number; stripeFeeEurCents: number },
    amount: number,
  ): number {
    if (jp.releasedAt) return Math.max(0, amount - Math.min(amount, jp.netAmountEurCents));
    // Prima dello sblocco commissione e costo della carta li paga già lui
    // allo sblocco; se tutto torna al cliente lo sblocco non c'è più (e la
    // trattenuta gli è stata restituita): diventano un suo debito.
    const heldCommission = Math.round((jp.paidEurCents * ONLINE_APP_FEE_PERCENT) / 100);
    return jp.refundedEurCents + amount >= jp.paidEurCents ? jp.stripeFeeEurCents + heldCommission : 0;
  }

  /** Debito del professionista verso la piattaforma, recuperato dai suoi sblocchi successivi (§260). */
  private async addProfessionalDebt(jobPaymentId: string, amountEurCents: number, reason: string): Promise<void> {
    if (amountEurCents <= 0) return;
    const jp = await this.prisma.jobPayment.update({
      where: { id: jobPaymentId },
      data: { professionalDebtEurCents: { increment: amountEurCents } },
      include: { booking: { select: { id: true, professionalProfile: { select: { userId: true } }, quote: { select: { guidedRequestId: true } } } } },
    });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: jobPaymentId,
      fieldName: "professionalDebtEurCents",
      newValue: { added: amountEurCents, total: jp.professionalDebtEurCents },
      reason,
    });
    await this.notificationsService.notify(jp.booking.professionalProfile.userId, "JOB_PAYMENT_DEBT", {
      bookingId: jp.booking.id,
      guidedRequestId: jp.booking.quote?.guidedRequestId ?? null,
      amountEurCents,
    });
  }

  /** Debiti ancora aperti del professionista, dal più vecchio. */
  private professionalDebts(professionalProfileId: string) {
    return this.prisma.jobPayment.findMany({
      where: { booking: { professionalProfileId }, professionalDebtEurCents: { gt: 0 } },
      orderBy: { createdAt: "asc" },
      select: { id: true, professionalDebtEurCents: true },
    });
  }

  /** Segna come pagata una cifra ripresa dallo sblocco di `fromJobPaymentId`, dal debito più vecchio. */
  private async settleDebts(professionalProfileId: string, amountEurCents: number, fromJobPaymentId: string): Promise<void> {
    let remaining = amountEurCents;
    for (const debt of await this.professionalDebts(professionalProfileId)) {
      if (remaining <= 0) break;
      const part = Math.min(remaining, debt.professionalDebtEurCents);
      const done = await this.prisma.jobPayment.updateMany({
        where: { id: debt.id, professionalDebtEurCents: { gte: part } },
        data: { professionalDebtEurCents: { decrement: part } },
      });
      if (done.count === 0) continue;
      remaining -= part;
      await this.auditLogService.record({
        entityType: "JobPayment",
        entityId: debt.id,
        fieldName: "professionalDebtEurCents",
        newValue: { recovered: part, fromJobPaymentId },
        reason: "Debito del professionista recuperato dallo sblocco di un altro lavoro.",
      });
    }
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
   * (docs/CHANGELOG.md §249): Stripe non li tiene oltre 90 e poi li manda
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
   * del professionista (§249) i soldi si riprendono da lì; se erano già
   * sbloccati se ne riprende la sua quota dal bonifico non ancora partito e
   * il resto diventa un suo debito, trattenuto dai pagamenti successivi
   * (§260). Col vecchio modello si storna il trasferimento.
   * `professionalFault` (segnalazione accolta): anche i costi del pagamento
   * che Stripe non restituisce sono a carico del professionista.
   */
  async refundOnline(
    jobPaymentId: string,
    amountEurCents: number | "ALL",
    reason: string,
    byUserId: string | null,
    opts: { professionalFault?: boolean } = {},
  ): Promise<number> {
    const jp = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId } });
    if (!jp || jp.paymentMethod !== "MANOVIA") throw new NotFoundException("Nessun pagamento online su questo lavoro.");
    const available = jp.paidEurCents - jp.refundedEurCents;
    const amount = amountEurCents === "ALL" ? available : Math.min(amountEurCents, available);
    if (amount <= 0) return 0;
    let debt = opts.professionalFault && jp.stripeDestinationAccountId ? this.faultCostsEurCents(jp, amount) : 0;
    let feeToReturn = 0;
    if (jp.stripeDestinationAccountId) {
      if (jp.releasedAt && jp.netAmountEurCents > 0 && jp.stripeDirectCharge) {
        // Addebito diretto (§261): Stripe prende tutto il rimborso dal suo
        // saldo, anche la parte che noi abbiamo già trattenuto. Il bonifico
        // non ancora partito si riduce. Se la colpa è sua quella parte resta
        // a suo carico; altrimenti gli restituiamo la nostra trattenuta.
        const proShare = Math.min(amount, jp.netAmountEurCents);
        await this.prisma.jobPayment.update({
          where: { id: jp.id },
          data: { netAmountEurCents: { decrement: proShare }, payoutPendingEurCents: { decrement: Math.min(amount, jp.payoutPendingEurCents) } },
        });
        debt = 0;
        if (!opts.professionalFault) feeToReturn = amount - proShare;
      } else if (jp.releasedAt && jp.netAmountEurCents > 0) {
        const proShare = Math.min(amount, jp.netAmountEurCents);
        const fromPending = Math.min(proShare, jp.payoutPendingEurCents);
        const recovered = fromPending > 0 ? await this.reverseFromProfessional(jp.id, fromPending, `refund-${jp.refundedEurCents}`) : 0;
        debt += proShare - recovered;
        // Il bonifico non ancora partito parte solo per quanto resta.
        await this.prisma.jobPayment.update({
          where: { id: jp.id },
          data: { netAmountEurCents: { decrement: proShare }, payoutPendingEurCents: { decrement: recovered } },
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
    if (feeToReturn > 0) await this.returnApplicationFee(jp.id, feeToReturn, `Rimborso al cliente: ${reason}`);
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
    if (debt > 0) await this.addProfessionalDebt(jp.id, debt, `Rimborso al cliente: ${reason}`);
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
    // Addebito diretto (§261): il rimborso si fa sul conto del professionista e Stripe lo prende dal suo saldo.
    const account = chargeAccount(jp);
    const waiting: Stripe.Refund[] = [];
    let remaining = amountEurCents;
    for (const pi of [jp.balancePaymentIntentId, jp.stripePaymentIntentId]) {
      if (!pi || remaining <= 0) continue;
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] }, onAccount(account));
      const charge = intent.latest_charge as Stripe.Charge | null;
      const refundable = charge ? charge.amount - charge.amount_refunded : 0;
      const part = Math.min(remaining, refundable);
      if (part <= 0) continue;
      // Chiave legata a quanto già rimborsato: un nuovo tentativo dello stesso
      // rimborso non parte due volte, un rimborso successivo sì.
      const refund = await stripe.refunds.create(
        {
          payment_intent: pi,
          amount: part,
          ...(fromProfessional && !account && intent.transfer_data?.destination ? { reverse_transfer: true } : {}),
          metadata: { jobPaymentId, reason: reason.slice(0, 450) },
        },
        { idempotencyKey: `job-refund-${pi}-${charge?.amount_refunded ?? 0}-${part}`, ...onAccount(account) },
      );
      if (account && refund.status === "pending") waiting.push(refund);
      remaining -= part;
    }
    const refunded = amountEurCents - remaining;
    const after = await this.prisma.jobPayment.update({ where: { id: jobPaymentId }, data: { refundedEurCents: { increment: refunded } } });
    if (fromProfessional) await this.keepProfessionalBalancePositive(after);
    if (account && waiting.length > 0) await this.reportRefundWaiting(jobPaymentId, account, waiting);
  }

  /**
   * Rimborso rimasto in attesa perché il saldo Stripe del professionista
   * non basta (addebito diretto, §262): il cliente sa che arriva e quando,
   * il professionista sa che si chiude coi prossimi fondi.
   */
  private async reportRefundWaiting(jobPaymentId: string, account: string, refunds: Stripe.Refund[]): Promise<void> {
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({
      where: { id: jobPaymentId },
      include: { booking: { select: { id: true, clientId: true, quote: { select: { guidedRequestId: true } }, professionalProfile: { select: { userId: true } } } } },
    });
    const guidedRequestId = jp.booking.quote?.guidedRequestId ?? null;
    await this.markRefundWaiting(refunds, account, { clientUserId: jp.booking.clientId, guidedRequestId, bookingId: jp.booking.id });
    const amountEurCents = refunds.reduce((sum, r) => sum + r.amount, 0);
    const payload = { bookingId: jp.booking.id, guidedRequestId, amountEurCents };
    await this.notificationsService.notify(jp.booking.clientId, "JOB_REFUND_PENDING", { ...payload, audience: "CLIENT" });
    await this.notificationsService.notify(jp.booking.professionalProfile.userId, "JOB_REFUND_WAITING_FUNDS", payload);
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

  /**
   * Riprende soldi dal conto del professionista verso la piattaforma.
   * Addebito a destinazione: storno dei trasferimenti (prima il saldo, poi
   * l'acconto). Addebito diretto (§261): prelievo dal suo saldo Stripe
   * (account debit), maggiorato del costo Stripe dell'1,4%, a suo carico; se
   * il saldo non basta non si preleva nulla e la cifra resta un suo debito.
   * Restituisce quanto ripreso, al netto del costo del prelievo.
   */
  private async reverseFromProfessional(jobPaymentId: string, amountEurCents: number, tag: string): Promise<number> {
    const stripe = this.requireStripe();
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: jobPaymentId } });
    if (jp.stripeDirectCharge && jp.stripeDestinationAccountId) {
      if (amountEurCents <= 0) return 0;
      try {
        await stripe.charges.create(
          {
            amount: accountDebitGrossEurCents(amountEurCents),
            currency: "eur",
            source: jp.stripeDestinationAccountId,
            description: "Costi e somme dovute alla piattaforma per i lavori",
            metadata: { kind: "job_account_debit", jobPaymentId, tag },
          },
          { idempotencyKey: `job-debit-${jp.id}-${tag}-${amountEurCents}` },
        );
      } catch (err) {
        this.logger.warn(`Prelievo dal conto di ${jp.stripeDestinationAccountId} non riuscito (${jp.id}): ${(err as Error).message}`);
        return 0;
      }
      return amountEurCents;
    }
    let remaining = amountEurCents;
    // Anche la cifra restituita dopo una contestazione vinta (§260), prima dei due pagamenti.
    for (const source of [jp.disputeReturnTransferId, jp.balancePaymentIntentId, jp.stripePaymentIntentId]) {
      if (!source || remaining <= 0) continue;
      let transfer: Stripe.Transfer | string | null | undefined;
      if (source === jp.disputeReturnTransferId) transfer = await stripe.transfers.retrieve(source);
      else {
        const intent = await stripe.paymentIntents.retrieve(source, { expand: ["latest_charge.transfer"] });
        transfer = (intent.latest_charge as Stripe.Charge | null)?.transfer;
      }
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
      // Il pagamento sta sul conto su cui è nato (§261), l'application fee sulla piattaforma.
      const account = chargeAccount(jp);
      const intent = account
        ? await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] }, onAccount(account))
        : await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge.application_fee"] });
      const raw = (intent.latest_charge as Stripe.Charge | null)?.application_fee;
      const fee = typeof raw === "string" ? await stripe.applicationFees.retrieve(raw) : raw;
      if (!fee) continue;
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
