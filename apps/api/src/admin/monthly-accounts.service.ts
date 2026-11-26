import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  PROFIT_TARGET_YEAR_EUR_CENTS,
  marginPerPaying,
  payingNeededFor,
  splitVatEurCents,
  type AdminMonthlyAccounts,
  type MonthlyAccountsSubscriberRow,
  type MonthlyCostLine,
  type SaveMonthlyCostsInput,
  type SaveProfitTargetInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { subscriptionState, tierOfPlan } from "../subscriptions/subscription-rules";
import { COUNTED_USER, countingFrom } from "../site-counts/counted";
import {
  INVOICE_COST_EUR_CENTS,
  connectCostEurCents,
  monthKey,
  monthRange,
  monthlyPriceEurCents,
  selectableMonths,
  subscriptionStripeCostEurCents,
} from "./monthly-accounts";

/** Professionisti che contano: né eliminati, né dimostrativi, né account di prova (§395). */
const COUNTED_PROFILE = { deletedAt: null, isDemo: false, user: COUNTED_USER };

/**
 * Admin → Numeri → Conti del mese (decisione di Luca del 25/11/2026,
 * docs/changelog/2026-11-25-conti-del-mese.md).
 */
@Injectable()
export class MonthlyAccountsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {}

  async summary(requestedMonth: string | undefined, now: Date = new Date()): Promise<AdminMonthlyAccounts> {
    const from = countingFrom(now);
    const months = selectableMonths(now, from);
    const month = requestedMonth && months.includes(requestedMonth) ? requestedMonth : (months[0] ?? monthKey(now));
    const range = monthRange(month);
    const inMonth = { gte: range.from, lt: range.to };

    const [subscriptions, canceledInMonth, excluded, payments, feeEntries, invoices, whatsapp, costRows, settings] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { professionalProfile: COUNTED_PROFILE },
        select: {
          professionalProfileId: true,
          professionalProfile: { select: { userId: true, businessName: true, city: true, user: { select: { phone: true } } } },
          plan: true,
          status: true,
          trialEndsAt: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
          billingInterval: true,
          cardAddedAt: true,
          stripeSubscriptionId: true,
        },
      }),
      this.prisma.subscription.count({ where: { status: "CANCELED", canceledAt: inMonth, professionalProfile: COUNTED_PROFILE } }),
      // Le trattenute non hanno la relazione col profilo: si tolgono per elenco.
      this.prisma.professionalProfile.findMany({
        where: { OR: [{ isDemo: true }, { user: { testAccountAt: { not: null } } }] },
        select: { id: true },
      }),
      this.prisma.payment.findMany({
        where: { status: "SUCCEEDED", type: { in: ["SUBSCRIPTION", "VISIBILITY_BOOST"] }, createdAt: inMonth, professionalProfile: COUNTED_PROFILE },
        select: { type: true, amountEurCents: true },
      }),
      this.prisma.platformFeeEntry.findMany({
        where: { occurredAt: inMonth, kind: { in: ["HOLD", "RETURN"] } },
        select: { professionalProfileId: true, kind: true, taxableEurCents: true, paymentEurCents: true, cardFeeEurCents: true },
      }),
      this.prisma.invoice.findMany({ where: { issuedAt: inMonth }, select: { professionalProfileId: true } }),
      this.prisma.outboundMessage.aggregate({ where: { createdAt: inMonth }, _sum: { costMicroEur: true } }),
      this.prisma.platformMonthlyCost.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
      this.prisma.platformAccountsSettings.findFirst({ select: { profitTargetYearEurCents: true } }),
    ]);

    // Fotografia di oggi.
    const byTier = new Map<"BASE" | "PLUS" | "PRO", number>([
      ["BASE", 0],
      ["PLUS", 0],
      ["PRO", 0],
    ]);
    let paying = 0;
    let recurring = 0;
    let inFreeMonths = 0;
    let freeMonthsEnded = 0;
    let stayed = 0;
    const subscriberIds: string[] = [];
    const subscriberRows: Omit<MonthlyAccountsSubscriberRow, "requests">[] = [];
    for (const sub of subscriptions) {
      const state = subscriptionState(sub, now);
      const tier = tierOfPlan(sub.plan);
      // Con la carta i mesi gratis sono già un abbonamento Base di Stripe, con i giorni gratis davanti.
      const free = Boolean(sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime());
      const isPaying = (state === "ACTIVE" || state === "PAST_DUE") && tier !== null && Boolean(sub.stripeSubscriptionId) && !free;
      if (isPaying && tier) {
        paying += 1;
        byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
        recurring += monthlyPriceEurCents(tier, sub.billingInterval);
      }
      const freeWithCard = free && (state === "ACTIVE" || state === "PAST_DUE") && Boolean(sub.stripeSubscriptionId);
      if (freeWithCard) inFreeMonths += 1;
      if ((isPaying || freeWithCard) && tier) {
        subscriberIds.push(sub.professionalProfileId);
        const profile = sub.professionalProfile;
        subscriberRows.push({ userId: profile.userId, businessName: profile.businessName, city: profile.city, phone: profile.user.phone, tier, free: freeWithCard });
      }
      const ended = sub.cardAddedAt && sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime() && (!from || sub.trialEndsAt.getTime() >= from.getTime());
      if (ended) {
        freeMonthsEnded += 1;
        if (isPaying) stayed += 1;
      }
    }

    // Richieste arrivate nel mese agli abbonati di oggi (dal lancio, §395).
    const requestsFrom = from && from.getTime() > range.from.getTime() ? from : range.from;
    const leadsBySubscriber = subscriberIds.length
      ? await this.prisma.lead.groupBy({
          by: ["professionalProfileId"],
          where: { professionalProfileId: { in: subscriberIds }, createdAt: { gte: requestsFrom, lt: range.to } },
          _count: { _all: true },
        })
      : [];
    const requestsTotal = leadsBySubscriber.reduce((sum, row) => sum + row._count._all, 0);
    const requestsOf = new Map(leadsBySubscriber.map((row) => [row.professionalProfileId, row._count._all]));
    const subscriberList: MonthlyAccountsSubscriberRow[] = subscriberRows
      .map((row, index) => ({ ...row, requests: requestsOf.get(subscriberIds[index]!) ?? 0 }))
      .sort((a, b) => a.requests - b.requests || a.businessName.localeCompare(b.businessName, "it"));

    // Ricavi del mese, IVA esclusa.
    const excludedIds = new Set(excluded.map((p) => p.id));
    const fees = feeEntries.filter((e) => !excludedIds.has(e.professionalProfileId));
    const taxable = (type: string) => payments.filter((p) => p.type === type).reduce((sum, p) => sum + splitVatEurCents(p.amountEurCents).taxableEurCents, 0);
    const subscriptionsEurCents = taxable("SUBSCRIPTION");
    const visibilityEurCents = taxable("VISIBILITY_BOOST");
    const jobFeesEurCents = fees.reduce((sum, e) => sum + e.taxableEurCents, 0);
    const revenueTotal = subscriptionsEurCents + visibilityEurCents + jobFeesEurCents;

    // Costi che crescono con l'attività.
    const holds = fees.filter((e) => e.kind === "HOLD");
    const jobCardEurCents = holds.reduce((sum, e) => sum + e.cardFeeEurCents, 0);
    const connectEurCents = connectCostEurCents(new Set(holds.map((e) => e.professionalProfileId)).size, holds.map((e) => e.paymentEurCents));
    const subscriptionStripeEurCents = payments.reduce((sum, p) => sum + subscriptionStripeCostEurCents(p.amountEurCents), 0);
    const invoicesEurCents = invoices.filter((i) => !excludedIds.has(i.professionalProfileId)).length * INVOICE_COST_EUR_CENTS;
    const whatsappEurCents = Math.round((whatsapp._sum.costMicroEur ?? 0) / 10_000);
    const variableTotal = jobCardEurCents + connectEurCents + subscriptionStripeEurCents + invoicesEurCents + whatsappEurCents;

    const lines: MonthlyCostLine[] = costRows.map((row) => ({ label: row.label, monthlyEurCents: row.monthlyEurCents }));
    const fixedTotal = lines.reduce((sum, line) => sum + line.monthlyEurCents, 0);
    const margin = marginPerPaying({ paying, revenueEurCents: revenueTotal, variableCostsEurCents: variableTotal });
    const targetYear = settings?.profitTargetYearEurCents ?? PROFIT_TARGET_YEAR_EUR_CENTS;

    return {
      month,
      months,
      launched: from !== null,
      today: {
        paying,
        byTier: [...byTier].map(([tier, count]) => ({ tier, count })),
        inFreeMonths,
        averagePriceEurCents: paying > 0 ? Math.round(recurring / paying) : 0,
        monthlyRecurringEurCents: recurring,
        freeMonthsEnded,
        stayedAfterFreeMonths: stayed,
      },
      canceledInMonth,
      requests: { subscribers: subscriberIds.length, total: requestsTotal, withoutRequests: subscriberIds.length - leadsBySubscriber.length, list: subscriberList },
      revenue: { subscriptionsEurCents, visibilityEurCents, jobFeesEurCents, totalEurCents: revenueTotal },
      variableCosts: { jobCardEurCents, connectEurCents, subscriptionStripeEurCents, invoicesEurCents, whatsappEurCents, totalEurCents: variableTotal },
      fixedCosts: { lines, totalEurCents: fixedTotal },
      profitEurCents: revenueTotal - variableTotal - fixedTotal,
      target: {
        yearEurCents: targetYear,
        custom: settings !== null,
        marginPerPayingEurCents: margin.eurCents,
        marginEstimated: margin.estimated,
        payingNeeded: payingNeededFor(targetYear, fixedTotal, margin.eurCents),
      },
    };
  }

  /** Sostituisce tutte le voci dei costi fissi, nell'ordine dato. */
  async saveCosts(input: SaveMonthlyCostsInput, adminUserId: string): Promise<MonthlyCostLine[]> {
    await this.prisma.$transaction([
      // Voluto: l'elenco (massimo 30 voci di configurazione) si riscrive tutto, nell'ordine nuovo.
      this.prisma.platformMonthlyCost.deleteMany({ where: { id: { not: "" } } }),
      this.prisma.platformMonthlyCost.createMany({
        data: input.lines.map((line, position) => ({ label: line.label, monthlyEurCents: line.monthlyEurCents, position })),
      }),
    ]);
    await this.auditLogService.record({
      entityType: "PlatformMonthlyCost",
      entityId: "all",
      fieldName: "lines",
      newValue: input.lines.map((line) => `${line.label}: ${(line.monthlyEurCents / 100).toFixed(2)} €`),
      changedByUserId: adminUserId,
    });
    return input.lines;
  }

  /** Traguardo di utile all'anno: una riga sola, creata al primo salvataggio. */
  async saveProfitTarget(input: SaveProfitTargetInput, adminUserId: string): Promise<{ yearEurCents: number }> {
    const existing = await this.prisma.platformAccountsSettings.findFirst({ select: { id: true, profitTargetYearEurCents: true } });
    const data = { profitTargetYearEurCents: input.yearEurCents, updatedByUserId: adminUserId };
    if (existing) await this.prisma.platformAccountsSettings.update({ where: { id: existing.id }, data });
    else await this.prisma.platformAccountsSettings.create({ data });
    await this.auditLogService.record({
      entityType: "PlatformAccountsSettings",
      entityId: existing?.id ?? "new",
      fieldName: "profitTargetYearEurCents",
      oldValue: existing?.profitTargetYearEurCents ?? PROFIT_TARGET_YEAR_EUR_CENTS,
      newValue: input.yearEurCents,
      changedByUserId: adminUserId,
    });
    return { yearEurCents: input.yearEurCents };
  }
}
