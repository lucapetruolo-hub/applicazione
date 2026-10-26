import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  BONUS_MONTH_DAYS,
  BONUS_MONTH_NOTICE_DAYS,
  RENEWAL_NOTICE_DAYS,
  subscriptionTierInfo,
  tierPeriodPriceEurCents,
  type MySubscription,
  type BillingInterval,
  type PauseReason,
  type SubscriptionTier,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { PUBLIC_VISIBILITY_SELECT, publicVisibilityMissing } from "../professional-fiscal/public-visibility";
import { identityVerificationNeeded } from "../identity-verification/identity-provider-env";
import { NotificationsService } from "../notifications/notifications.service";
import {
  countsClientsOnce,
  hasLaunched,
  jobLimitReached,
  launchDate,
  monthlyLimit,
  pauseReason,
  periodNoticeToSend,
  subscriptionState,
  tierOfPlan,
  trialEndFor,
  upgradeQuotes,
  usageNoticeToSend,
  usagePeriod,
  usagePeriodKey,
  type SubscriptionRow,
} from "./subscription-rules";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pagamenti attivi su questo ambiente: solo allora pausa e avvisi sul limite hanno senso. */
function paymentsActive(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Pause attive: servono i pagamenti e il sito lanciato (`LAUNCH_DATE`
 * passata, docs/CHANGELOG.md §170). Senza data di lancio nessuno va in
 * pausa, anche con Stripe acceso: i professionisti reclutati prima del
 * lancio non spariscono dalla ricerca il giorno in cui si mette la chiave.
 */
function pausesActive(now: Date): boolean {
  return paymentsActive() && hasLaunched(now, launchDate());
}

/**
 * Abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md §161):
 * prova gratuita di un mese per tutti, mese regalato a sorpresa a chi non
 * ha ancora avuto lavori, conteggio dei lavori accettati del periodo (dal
 * rinnovo, §357) con avvisi all'80% e al 100%. Account in pausa (fuori dalla
 * ricerca, niente nuove richieste) a fine prova senza livello o ad
 * abbonamento concluso (docs/CHANGELOG.md §162); a lavori esauriti resta
 * nella ricerca ma non può mandare preventivi né rispondere per primo
 * (`jobLimitReachedAt`, §357). Rinnovo automatico via Stripe con avviso
 * prima di ogni rinnovo.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Avvia la prova gratuita alla creazione del profilo (idempotente): un mese dal lancio, o da oggi dopo il lancio. */
  async ensureTrial(professionalProfileId: string, now = new Date()): Promise<void> {
    await this.prisma.subscription.upsert({
      where: { professionalProfileId },
      create: {
        professionalProfileId,
        plan: "FREE",
        status: "TRIALING",
        trialEndsAt: trialEndFor(now, launchDate()),
      },
      update: {},
    });
  }

  /**
   * Lavori accettati nel periodo in corso (dal rinnovo, docs/CHANGELOG.md
   * §357): prenotazioni nate nel periodo, tranne quelle annullate dal
   * cliente (il professionista non ne ha colpa). Su Plus e Pro lo stesso
   * cliente conta una volta.
   */
  async countUsedJobs(professionalProfileId: string, row: SubscriptionRow | null, now = new Date()): Promise<number> {
    const period = usagePeriod(row, now);
    const where = {
      professionalProfileId,
      createdAt: { gte: period.start, lt: period.end },
      NOT: { status: "CANCELED" as const, canceledBy: "CLIENT" as const },
    };
    if (!countsClientsOnce(row, now)) return this.prisma.booking.count({ where });
    const clients = await this.prisma.booking.findMany({ where, select: { clientId: true }, distinct: ["clientId"] });
    return clients.length;
  }

  /** Dopo ogni nuovo lavoro accettato: avviso vicino o al limite, una volta al mese. Mai un errore verso chi chiama. */
  async afterJobAccepted(professionalProfileId: string): Promise<void> {
    try {
      const now = new Date();
      const sub = await this.prisma.subscription.findUnique({
        where: { professionalProfileId },
        include: { professionalProfile: { select: { userId: true } } },
      });
      if (!sub) return;
      const used = await this.countUsedJobs(professionalProfileId, sub, now);
      // Senza pagamenti attivi o prima del lancio non c'è limite né livello superiore: niente avvisi.
      if (!pausesActive(now)) return;
      await this.syncPause(professionalProfileId, now, used);
      const limit = monthlyLimit(sub, now);
      if (limit === null) return;
      const period = usagePeriod(sub, now);
      const periodKey = usagePeriodKey(period);
      const notice = usageNoticeToSend(used, limit, sub.usageNoticeKey, periodKey);
      if (!notice) return;
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { usageNoticeKey: `${periodKey}:${notice}` } });
      await this.notificationsService.notify(
        sub.professionalProfile.userId,
        notice === "100" ? "SUBSCRIPTION_LIMIT_REACHED" : "SUBSCRIPTION_LIMIT_NEAR",
        { used, limit, tier: tierOfPlan(sub.plan), tierLabel: subscriptionTierInfo(tierOfPlan(sub.plan) ?? "BASE").label, until: period.end.toISOString() },
      );
    } catch (error) {
      this.logger.error(`Avviso limite abbonamento non riuscito per ${professionalProfileId}`, error as Error);
    }
  }

  /**
   * Mette in pausa o riattiva il profilo secondo l'abbonamento, e segna o
   * toglie i lavori esauriti del periodo (§357). Avvisa quando va in pausa
   * per fine prova o fine abbonamento (il limite raggiunto ha già il suo
   * avviso). I profili dimostrativi non vanno mai in pausa né al limite, e
   * nessuno ci va finché i pagamenti non sono attivi (senza
   * STRIPE_SECRET_KEY non si può scegliere un livello: a fine prova la
   * ricerca resterebbe vuota). Restituisce il motivo della pausa e il limite.
   */
  async syncPause(
    professionalProfileId: string,
    now = new Date(),
    usedJobs?: number,
  ): Promise<{ reason: PauseReason | null; limitReached: boolean }> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { userId: true, isDemo: true, deletedAt: true, pausedReason: true, jobLimitReachedAt: true, subscription: true },
    });
    if (!profile || profile.deletedAt) return { reason: null, limitReached: false };
    const active = !profile.isDemo && pausesActive(now);
    const reason = active ? pauseReason(profile.subscription, now) : null;
    const used = active && !reason ? (usedJobs ?? (await this.countUsedJobs(professionalProfileId, profile.subscription, now))) : 0;
    const limitReached = active && jobLimitReached(profile.subscription, used, now);
    const pauseChanged = reason !== profile.pausedReason;
    const limitChanged = limitReached !== Boolean(profile.jobLimitReachedAt);
    if (!pauseChanged && !limitChanged) return { reason, limitReached };
    await this.prisma.professionalProfile.update({
      where: { id: professionalProfileId },
      data: {
        ...(pauseChanged ? { pausedAt: reason ? now : null, pausedReason: reason } : {}),
        ...(limitChanged ? { jobLimitReachedAt: limitReached ? now : null } : {}),
      },
    });
    if (pauseChanged && (reason === "TRIAL_ENDED" || reason === "SUBSCRIPTION_ENDED")) {
      await this.notificationsService.notify(profile.userId, "SUBSCRIPTION_PAUSED", { reason });
    }
    return { reason, limitReached };
  }

  async getMySubscription(userId: string): Promise<MySubscription> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true, verified: true, identityExpiredAt: true, ...PUBLIC_VISIBILITY_SELECT } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato. Completa prima il tuo profilo.");
    const now = new Date();
    const sub = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    const used = await this.countUsedJobs(profile.id, sub, now);
    const { reason: pausedReason, limitReached } = await this.syncPause(profile.id, now, used);
    const period = usagePeriod(sub, now);
    const launch = launchDate();
    // Prima del lancio la prova non scorre (docs/CHANGELOG.md §170): finisce
    // un mese dopo il lancio, o non ha ancora una data se il lancio non è fissato.
    const waitingLaunch = !hasLaunched(now, launch) && (!sub || sub.status === "TRIALING");
    const state = waitingLaunch ? "TRIAL" : subscriptionState(sub, now);
    const trialEndsAt = waitingLaunch ? (launch ? trialEndFor(now, launch) : null) : (sub?.trialEndsAt ?? null);
    const tier = sub && state !== "TRIAL" && state !== "TRIAL_ENDED" ? tierOfPlan(sub.plan) : null;
    return {
      state,
      tier,
      pausedReason,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      bonusMonthGranted: Boolean(sub?.bonusMonthGrantedAt),
      usage: {
        used,
        limit: monthlyLimit(sub, now),
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        countsClientsOnce: countsClientsOnce(sub, now),
      },
      limitReached,
      billingInterval: tier && sub ? sub.billingInterval : null,
      upgradeQuotes: upgradeQuotes({
        state,
        tier,
        interval: sub?.billingInterval ?? "MONTH",
        waitingLaunch,
        trialEndsAt,
        currentPeriodStart: sub?.currentPeriodStart ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        now,
      }),
      checkoutAvailable: paymentsActive(),
      fiscalDataNeeded: publicVisibilityMissing(profile),
      identityVerificationNeeded: identityVerificationNeeded(profile),
    };
  }

  /**
   * Stato dell'abbonamento Stripe applicato alla riga locale (webhook, cambio
   * livello, annullamento). Ignora un evento di un vecchio abbonamento già
   * sostituito da uno nuovo.
   */
  async applyStripeSubscription(input: {
    professionalProfileId?: string | null;
    stripeSubscriptionId: string;
    status: "ACTIVE" | "PAST_DUE" | "CANCELED" | null;
    tier: SubscriptionTier | null;
    interval: BillingInterval | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart?: Date | null;
    currentPeriodEnd: Date | null;
  }): Promise<void> {
    const row =
      (await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: input.stripeSubscriptionId } })) ??
      (input.professionalProfileId ? await this.prisma.subscription.findUnique({ where: { professionalProfileId: input.professionalProfileId } }) : null);
    if (!row) return;
    if (row.stripeSubscriptionId && row.stripeSubscriptionId !== input.stripeSubscriptionId && row.status !== "CANCELED") return;
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: {
        stripeSubscriptionId: input.stripeSubscriptionId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.tier ? { plan: input.tier } : {}),
        ...(input.interval ? { billingInterval: input.interval } : {}),
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        ...(input.currentPeriodStart !== undefined ? { currentPeriodStart: input.currentPeriodStart } : {}),
        currentPeriodEnd: input.currentPeriodEnd,
      },
    });
    await this.syncPause(row.professionalProfileId);
  }

  /** Rinnovo pagato o pagamento non riuscito (webhook `invoice.*`). */
  async onInvoice(
    stripeSubscriptionId: string,
    outcome: { paid: boolean; renewal: boolean; amountEurCents: number; nextPeriodEnd: Date | null },
  ): Promise<void> {
    const row = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { professionalProfile: { select: { userId: true } } },
    });
    if (!row || row.status === "CANCELED") return;
    await this.prisma.subscription.update({ where: { id: row.id }, data: { status: outcome.paid ? "ACTIVE" : "PAST_DUE" } });
    const tier = tierOfPlan(row.plan);
    const userId = row.professionalProfile.userId;
    if (!outcome.paid) {
      await this.notificationsService.notify(userId, "SUBSCRIPTION_PAYMENT_FAILED", {});
    } else if (outcome.renewal) {
      await this.notificationsService.notify(userId, "SUBSCRIPTION_RENEWED", {
        tierLabel: tier ? subscriptionTierInfo(tier).label : "",
        amountEurCents: outcome.amountEurCents,
        date: outcome.nextPeriodEnd?.toISOString() ?? null,
      });
    }
    await this.syncPause(row.professionalProfileId);
  }

  /**
   * Ogni ora: mette in pausa chi ha finito la prova o l'abbonamento e
   * toglie il limite a chi riparte col periodo nuovo (al rinnovo, §357). Scrive solo quando lo stato cambia;
   * i profili sono pochi alla scala di lancio (CLAUDE.md §7).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runPauseSweep(now = new Date()): Promise<void> {
    await this.alignTrialsToLaunch(now);
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { deletedAt: null, isDemo: false },
      select: { id: true },
    });
    for (const profile of profiles) {
      try {
        await this.syncPause(profile.id, now);
      } catch (error) {
        this.logger.error(`Pausa abbonamento non aggiornata per ${profile.id}`, error as Error);
      }
    }
  }

  /**
   * Dal lancio in poi: chi era in prova da prima del lancio la finisce un
   * mese dopo il lancio (docs/CHANGELOG.md §170). Solo prove non ancora
   * allungate oltre quella data e senza abbonamento Stripe; idempotente.
   */
  async alignTrialsToLaunch(now = new Date()): Promise<number> {
    const launch = launchDate();
    if (!hasLaunched(now, launch)) return 0;
    const launchTrialEnd = trialEndFor(launch!, launch);
    const result = await this.prisma.subscription.updateMany({
      where: { status: "TRIALING", stripeSubscriptionId: null, createdAt: { lt: launch! }, trialEndsAt: { lt: launchTrialEnd } },
      data: { trialEndsAt: launchTrialEnd },
    });
    return result.count;
  }

  /** Ogni giorno: avviso pochi giorni prima del rinnovo automatico, o della fine se annullato. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runPeriodNotices(now = new Date()): Promise<void> {
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ["ACTIVE", "PAST_DUE"] },
        currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + RENEWAL_NOTICE_DAYS * DAY_MS) },
        professionalProfile: { deletedAt: null },
      },
      include: { professionalProfile: { select: { userId: true } } },
    });
    for (const sub of subs) {
      try {
        const notice = periodNoticeToSend({ ...sub, noticeFor: sub.periodNoticeFor }, now, RENEWAL_NOTICE_DAYS);
        if (!notice) continue;
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { periodNoticeFor: sub.currentPeriodEnd } });
        const tier = tierOfPlan(sub.plan);
        await this.notificationsService.notify(sub.professionalProfile.userId, notice === "ENDING" ? "SUBSCRIPTION_ENDING" : "SUBSCRIPTION_RENEWING", {
          tierLabel: tier ? subscriptionTierInfo(tier).label : "",
          amountEurCents: tier ? tierPeriodPriceEurCents(tier, sub.billingInterval) : null,
          interval: sub.billingInterval,
          date: sub.currentPeriodEnd!.toISOString(),
        });
      } catch (error) {
        this.logger.error(`Avviso di rinnovo non riuscito per ${sub.id}`, error as Error);
      }
    }
  }

  /**
   * Ogni giorno: a chi è in prova, a pochi giorni dalla scadenza, senza
   * ancora nessun lavoro → mese regalato (una volta sola). Agli altri,
   * avviso di fine prova. Chi ha già scelto un livello durante la prova
   * riceve invece l'avviso di rinnovo (runPeriodNotices).
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runTrialCheck(now = new Date()): Promise<void> {
    // Prima del lancio la prova non scorre: nessun regalo né avviso di fine prova.
    if (!hasLaunched(now, launchDate())) return;
    const endingBefore = new Date(now.getTime() + BONUS_MONTH_NOTICE_DAYS * DAY_MS);
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { gt: now, lte: endingBefore },
        OR: [{ bonusMonthGrantedAt: null }, { trialEndingNotifiedAt: null }],
        professionalProfile: { deletedAt: null },
      },
      include: { professionalProfile: { select: { userId: true } } },
    });
    for (const sub of subs) {
      try {
        const userId = sub.professionalProfile.userId;
        if (!sub.bonusMonthGrantedAt) {
          const jobs = await this.prisma.booking.count({ where: { professionalProfileId: sub.professionalProfileId } });
          if (jobs === 0) {
            const trialEndsAt = new Date(sub.trialEndsAt!.getTime() + BONUS_MONTH_DAYS * DAY_MS);
            await this.prisma.subscription.update({ where: { id: sub.id }, data: { trialEndsAt, bonusMonthGrantedAt: now } });
            await this.notificationsService.notify(userId, "SUBSCRIPTION_BONUS_MONTH", { trialEndsAt: trialEndsAt.toISOString(), date: trialEndsAt.toISOString() });
            continue;
          }
        }
        if (!sub.trialEndingNotifiedAt) {
          await this.prisma.subscription.update({ where: { id: sub.id }, data: { trialEndingNotifiedAt: now } });
          await this.notificationsService.notify(userId, "SUBSCRIPTION_TRIAL_ENDING", {
            trialEndsAt: sub.trialEndsAt!.toISOString(),
            date: sub.trialEndsAt!.toISOString(),
          });
        }
      } catch (error) {
        this.logger.error(`Controllo fine prova non riuscito per ${sub.id}`, error as Error);
      }
    }
  }
}
