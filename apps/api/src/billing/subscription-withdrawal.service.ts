import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import {
  SUBSCRIPTION_WITHDRAWAL_DAYS,
  subscriptionTierInfo,
  subscriptionWithdrawalRefundEurCents,
  type AdminSubscriptionWithdrawal,
  type SubscriptionWithdrawalOption,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { InvoicesService } from "../accounting/invoices.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { monthlyLimit } from "../subscriptions/subscription-rules";
import { subscriptionPriceOf } from "./billing.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Primo pagamento di un livello ancora dentro i 14 giorni, letto da Stripe. */
type EligiblePayment = {
  stripeInvoiceId: string;
  paymentIntentId: string | null;
  paidEurCents: number;
  paidAt: Date;
  periodDays: number;
  tierLabel: string;
};

function stripeId(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Recesso dall'abbonamento entro 14 giorni (decisione di Luca del 26/11/2026,
 * docs/changelog/2026-11-26-recesso-abbonamento.md, come fa Anthropic con
 * Claude): solo chi lavora senza partita IVA (consumatore), su richiesta dal
 * sito, entro 14 giorni dal primo pagamento di un livello (dopo i mesi gratis
 * o passando a un livello superiore); i rinnovi dello stesso livello no. Il
 * rimborso è calcolato alla richiesta (giorni o lavori usati, la parte più
 * alta) e l'admin lo approva: allora l'abbonamento si chiude subito e parte il
 * rimborso sulla carta. La nota di credito nasce dal rimborso (webhook
 * `charge.refunded`), come per ogni rimborso dell'abbonamento.
 */
@Injectable()
export class SubscriptionWithdrawalService {
  private readonly logger = new Logger(SubscriptionWithdrawalService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly invoicesService?: InvoicesService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  private async profileOf(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true, fiscalProfile: { select: { entityType: true } } },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return profile;
  }

  /** Il primo pagamento del livello in corso, se è degli ultimi 14 giorni (null per un rinnovo o se è passato più tempo). */
  private async eligiblePayment(stripeSubscriptionId: string, now: Date): Promise<EligiblePayment | null> {
    if (!this.stripe) return null;
    const list = await this.stripe.invoices.list({ subscription: stripeSubscriptionId, status: "paid", limit: 24 });
    const paid = list.data.filter((invoice) => invoice.amount_paid > 0);
    const latest = paid[0];
    if (!latest) return null;
    const paidAtSeconds = latest.status_transitions?.paid_at ?? latest.created;
    const paidAt = new Date(paidAtSeconds * 1000);
    if (now.getTime() - paidAt.getTime() > SUBSCRIPTION_WITHDRAWAL_DAYS * DAY_MS) return null;
    const priceKey = (invoice: Stripe.Invoice) => {
      const ref = invoice.lines?.data.find((line) => line.amount > 0)?.pricing?.price_details?.price;
      return typeof ref === "string" ? ref : (ref?.id ?? null);
    };
    const price = priceKey(latest);
    // Rinnovo: un pagamento prima con lo stesso prezzo (stesso livello e stesso rinnovo).
    if (price && paid.slice(1).some((invoice) => priceKey(invoice) === price)) return null;
    const line = latest.lines?.data.find((l) => l.amount > 0);
    const periodDays = line?.period ? Math.max(1, Math.round((line.period.end - line.period.start) / 86_400)) : 30;
    const info = subscriptionPriceOf(price ?? undefined);
    const payments = await this.stripe.invoicePayments.list({ invoice: latest.id, status: "paid", limit: 1 }).catch(() => null);
    const paymentIntentId = stripeId(payments?.data[0]?.payment?.payment_intent ?? null);
    return {
      stripeInvoiceId: latest.id,
      paymentIntentId,
      paidEurCents: latest.amount_paid,
      paidAt,
      periodDays,
      tierLabel: info ? `${subscriptionTierInfo(info.tier).label} ${info.interval === "YEAR" ? "annuale" : "mensile"}` : "Abbonamento",
    };
  }

  /** Dati del rimborso: giorni e lavori usati dal pagamento. */
  private async usage(professionalProfileId: string, payment: EligiblePayment, now: Date) {
    const sub = await this.prisma.subscription.findUnique({ where: { professionalProfileId } });
    const jobsUsed = await this.subscriptionsService.countUsedJobs(professionalProfileId, sub, now);
    const jobsLimit = monthlyLimit(sub, now);
    const daysUsed = Math.max(1, Math.ceil((now.getTime() - payment.paidAt.getTime()) / DAY_MS));
    const proposedRefundEurCents = subscriptionWithdrawalRefundEurCents({ paidEurCents: payment.paidEurCents, daysUsed, periodDays: payment.periodDays, jobsUsed, jobsLimit });
    return { jobsUsed, jobsLimit, daysUsed, proposedRefundEurCents };
  }

  /** Per la pagina Abbonamento: si può chiedere il recesso? */
  async myOption(userId: string, now = new Date()): Promise<SubscriptionWithdrawalOption | null> {
    const profile = await this.profileOf(userId);
    if (profile.fiscalProfile?.entityType !== "PRIVATE_INDIVIDUAL") return null;
    const pending = await this.prisma.subscriptionWithdrawal.findFirst({ where: { professionalProfileId: profile.id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
    if (pending) return { state: "REQUESTED", requestedAt: pending.createdAt.toISOString() };
    const sub = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id }, select: { stripeSubscriptionId: true, status: true } });
    if (!sub?.stripeSubscriptionId || sub.status === "CANCELED") return null;
    const payment = await this.eligiblePayment(sub.stripeSubscriptionId, now).catch((error: unknown) => {
      this.logger.warn(`Pagamenti dell'abbonamento non letti per il recesso: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!payment) return null;
    // Già chiesto e deciso per questo stesso pagamento: niente seconda richiesta.
    if (await this.prisma.subscriptionWithdrawal.findFirst({ where: { stripeInvoiceId: payment.stripeInvoiceId }, select: { id: true } })) return null;
    const { proposedRefundEurCents } = await this.usage(profile.id, payment, now);
    return {
      state: "AVAILABLE",
      until: new Date(payment.paidAt.getTime() + SUBSCRIPTION_WITHDRAWAL_DAYS * DAY_MS).toISOString(),
      paidEurCents: payment.paidEurCents,
      estimatedRefundEurCents: proposedRefundEurCents,
      tierLabel: payment.tierLabel,
    };
  }

  /** Il professionista chiede il recesso: si salva col rimborso calcolato e lo vede la Finanza. */
  async request(userId: string, reason: string | undefined, now = new Date()): Promise<SubscriptionWithdrawalOption> {
    const profile = await this.profileOf(userId);
    if (profile.fiscalProfile?.entityType !== "PRIVATE_INDIVIDUAL") {
      throw new BadRequestException("Il recesso entro 14 giorni vale per chi lavora senza partita IVA. Puoi annullare il rinnovo quando vuoi.");
    }
    if (await this.prisma.subscriptionWithdrawal.findFirst({ where: { professionalProfileId: profile.id, status: "PENDING" }, select: { id: true } })) {
      throw new ConflictException("Hai già chiesto il recesso: ti scriviamo appena lo guardiamo.");
    }
    const sub = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id }, select: { stripeSubscriptionId: true, status: true } });
    const payment = sub?.stripeSubscriptionId && sub.status !== "CANCELED" ? await this.eligiblePayment(sub.stripeSubscriptionId, now) : null;
    if (!payment || (await this.prisma.subscriptionWithdrawal.findFirst({ where: { stripeInvoiceId: payment.stripeInvoiceId }, select: { id: true } }))) {
      throw new BadRequestException(`Il recesso si chiede entro ${SUBSCRIPTION_WITHDRAWAL_DAYS} giorni dal primo pagamento di un livello. Puoi annullare il rinnovo quando vuoi.`);
    }
    const use = await this.usage(profile.id, payment, now);
    const row = await this.prisma.subscriptionWithdrawal.create({
      data: {
        professionalProfileId: profile.id,
        reason: reason?.trim() || null,
        tierLabel: payment.tierLabel,
        paidEurCents: payment.paidEurCents,
        paidAt: payment.paidAt,
        stripeInvoiceId: payment.stripeInvoiceId,
        stripePaymentIntentId: payment.paymentIntentId,
        periodDays: payment.periodDays,
        ...use,
      },
    });
    await this.notificationsService.notify(userId, "SUBSCRIPTION_WITHDRAWAL_RECEIVED", {
      tierLabel: payment.tierLabel,
      refundEurCents: use.proposedRefundEurCents,
    });
    await this.invoicesService?.notifyFinanceAdmins("ADMIN_SUBSCRIPTION_WITHDRAWAL", { businessName: profile.businessName, refundEurCents: use.proposedRefundEurCents });
    return { state: "REQUESTED", requestedAt: row.createdAt.toISOString() };
  }

  async adminList(): Promise<AdminSubscriptionWithdrawal[]> {
    const rows = await this.prisma.subscriptionWithdrawal.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
    const profiles = await this.prisma.professionalProfile.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.professionalProfileId))] } }, select: { id: true, businessName: true } });
    const names = new Map(profiles.map((p) => [p.id, p.businessName]));
    return rows.map((row) => ({
      id: row.id,
      professionalProfileId: row.professionalProfileId,
      businessName: names.get(row.professionalProfileId) ?? "Account chiuso",
      status: row.status as AdminSubscriptionWithdrawal["status"],
      reason: row.reason,
      requestedAt: row.createdAt.toISOString(),
      tierLabel: row.tierLabel,
      paidEurCents: row.paidEurCents,
      paidAt: row.paidAt.toISOString(),
      daysUsed: row.daysUsed,
      periodDays: row.periodDays,
      jobsUsed: row.jobsUsed,
      jobsLimit: row.jobsLimit,
      proposedRefundEurCents: row.proposedRefundEurCents,
      refundEurCents: row.refundEurCents,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
    }));
  }

  /**
   * L'admin approva: abbonamento chiuso subito su Stripe e rimborso sulla
   * carta (l'importo proposto, o un altro scritto dall'admin, mai oltre
   * quanto pagato). La nota di credito la fa il webhook del rimborso.
   */
  async approve(adminUserId: string, id: string, refundEurCents: number | undefined, note: string | undefined): Promise<AdminSubscriptionWithdrawal[]> {
    const row = await this.prisma.subscriptionWithdrawal.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Richiesta di recesso non trovata.");
    if (row.status !== "PENDING") throw new ConflictException("Questa richiesta è già stata decisa.");
    const stripe = this.stripe;
    if (!stripe) throw new BadRequestException("Pagamenti non attivi su questo ambiente.");
    const amount = Math.min(row.paidEurCents, Math.max(0, refundEurCents ?? row.proposedRefundEurCents));
    // Prima si segna come decisa: un secondo tocco non rimborsa due volte.
    const claimed = await this.prisma.subscriptionWithdrawal.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", refundEurCents: amount, decidedAt: new Date(), decidedByUserId: adminUserId, decisionNote: note?.trim() || null },
    });
    if (claimed.count === 0) throw new ConflictException("Questa richiesta è già stata decisa.");
    await this.auditLogService.record({ entityType: "SubscriptionWithdrawal", entityId: id, fieldName: "status", oldValue: "PENDING", newValue: { status: "APPROVED", refundEurCents: amount }, changedByUserId: adminUserId, reason: note?.trim() || null });
    const sub = await this.prisma.subscription.findUnique({ where: { professionalProfileId: row.professionalProfileId } });
    if (sub?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId, { prorate: false, invoice_now: false }, { idempotencyKey: `recesso-${row.id}` });
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeInvalidRequestError && (error.code === "resource_missing" || /canceled/i.test(error.message)))) throw error;
      }
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "CANCELED", canceledAt: new Date(), cancelAtPeriodEnd: false, returnToBaseAt: null, pastDueSince: null },
      });
    }
    if (amount > 0 && row.stripePaymentIntentId) {
      await stripe.refunds.create(
        { payment_intent: row.stripePaymentIntentId, amount, reason: "requested_by_customer", metadata: { kind: "subscription_withdrawal", withdrawalId: row.id } },
        { idempotencyKey: `rimborso-recesso-${row.id}` },
      );
    }
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: row.professionalProfileId }, select: { userId: true } });
    if (pro) await this.notificationsService.notify(pro.userId, "SUBSCRIPTION_WITHDRAWAL_DONE", { tierLabel: row.tierLabel, refundEurCents: amount });
    return this.adminList();
  }

  /** L'admin rifiuta (per esempio oltre i 14 giorni o già usato tutto): il motivo va al professionista. */
  async reject(adminUserId: string, id: string, note: string): Promise<AdminSubscriptionWithdrawal[]> {
    const claimed = await this.prisma.subscriptionWithdrawal.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: adminUserId, decisionNote: note.trim() },
    });
    if (claimed.count === 0) throw new ConflictException("Questa richiesta non c'è o è già stata decisa.");
    await this.auditLogService.record({ entityType: "SubscriptionWithdrawal", entityId: id, fieldName: "status", oldValue: "PENDING", newValue: "REJECTED", changedByUserId: adminUserId, reason: note.trim() });
    const row = await this.prisma.subscriptionWithdrawal.findUniqueOrThrow({ where: { id } });
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: row.professionalProfileId }, select: { userId: true } });
    if (pro) await this.notificationsService.notify(pro.userId, "SUBSCRIPTION_WITHDRAWAL_REJECTED", { tierLabel: row.tierLabel, reason: note.trim() });
    return this.adminList();
  }
}
