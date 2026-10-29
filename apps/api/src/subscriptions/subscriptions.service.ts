import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  FOUNDER_FREE_MONTHS,
  FOUNDER_SPOTS,
  FOUNDER_TRIAL_DAYS,
  BONUS_MONTH_DAYS,
  BONUS_MONTH_NOTICE_DAYS,
  PAID_START_MIN_NOTICE_DAYS,
  RENEWAL_NOTICE_DAYS,
  subscriptionTierInfo,
  tierPeriodPriceEurCents,
  type MySubscription,
  type BillingInterval,
  type AdminFounders,
  type AdminPaidStart,
  type FounderSpots,
  type PauseReason,
  type SubscriptionTier,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { PUBLIC_VISIBILITY_SELECT, publicVisibilityMissing } from "../professional-fiscal/public-visibility";
import { identityVerificationNeeded } from "../identity-verification/identity-provider-env";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import {
  countsClientsOnce,
  founderFreeMonths,
  hasLaunched,
  jobLimitReached,
  launchDate,
  monthlyLimit,
  pauseReason,
  periodNoticeToSend,
  subscriptionState,
  tierOfPlan,
  trialDaysOf,
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
 * Lo stesso finché l'admin non accende gli abbonamenti a pagamento
 * (`freeOnHold`, docs/changelog/2026-10-29-abbonamenti-a-pagamento-da-admin.md).
 */
function pausesActive(now: Date, freeOnHold = false): boolean {
  return paymentsActive() && hasLaunched(now, launchDate()) && !freeOnHold;
}

/**
 * Gratis finché l'admin non accende gli abbonamenti a pagamento (richiesta
 * di Luca del 29/10/2026): nessun periodo gratuito finisce, niente pausa,
 * limite di lavori o livello da pagare. Non vale per gli account di prova
 * (§395), così il collaudo prova lo stesso la fine del mese gratuito.
 */
function freeOnHoldFor(paidFrom: Date | null, testAccountAt: Date | null | undefined): boolean {
  return paidFrom === null && !testAccountAt;
}

/** Giorno AAAA-MM-GG in ora italiana. */
function romeDay(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/** Righe nel periodo gratuito, senza livello scelto: le tocca l'accensione dei pagamenti. */
const FREE_PERIOD_WHERE = { status: "TRIALING", stripeSubscriptionId: null, professionalProfile: { deletedAt: null, isDemo: false } } as const;

/**
 * Abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md §161):
 * prova gratuita di un mese per tutti, mese regalato a sorpresa a chi non
 * ha ancora avuto lavori, conteggio dei lavori accettati del periodo (dal
 * rinnovo, §362) con avvisi all'80% e al 100%. Account in pausa (fuori dalla
 * ricerca, niente nuove richieste) a fine prova senza livello o ad
 * abbonamento concluso (docs/CHANGELOG.md §162); a lavori esauriti resta
 * nella ricerca ma non può mandare preventivi né rispondere per primo
 * (`jobLimitReachedAt`, §362). Rinnovo automatico via Stripe con avviso
 * prima di ogni rinnovo.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Giorno da cui gli abbonamenti sono a pagamento, scelto in Admin; null
   * finché l'admin non lo decide: tutti gratis (richiesta di Luca del
   * 29/10/2026, docs/changelog/2026-10-29-abbonamenti-a-pagamento-da-admin.md).
   */
  async paidFrom(): Promise<Date | null> {
    const row = await this.prisma.subscriptionSettings.findFirst({ select: { paidFrom: true } });
    return row?.paidFrom ?? null;
  }

  /** Il professionista è gratis in attesa che l'admin accenda i pagamenti? */
  async freeOnHold(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { testAccountAt: true } });
    return freeOnHoldFor(await this.paidFrom(), user?.testAccountAt);
  }

  /** Stato per Admin → Professionisti. */
  async adminPaidStart(now = new Date()): Promise<AdminPaidStart> {
    const paidFrom = await this.paidFrom();
    const [inFreePeriod, freeOnlyByWaiting, tierChosenInFreePeriod] = await Promise.all([
      this.prisma.subscription.count({ where: FREE_PERIOD_WHERE }),
      // Dopo il lancio: mesi gratuiti già finiti, gratis solo per l'attesa.
      hasLaunched(now, launchDate()) ? this.prisma.subscription.count({ where: { ...FREE_PERIOD_WHERE, trialEndsAt: { lte: now } } }) : 0,
      // Livello scelto nei giorni gratuiti: il primo addebito l'ha già fissato Stripe.
      this.prisma.subscription.count({
        where: { status: { in: ["ACTIVE", "PAST_DUE"] }, stripeSubscriptionId: { not: null }, trialEndsAt: { gt: now }, professionalProfile: { deletedAt: null } },
      }),
    ]);
    return {
      paidFrom: paidFrom?.toISOString() ?? null,
      started: paidFrom !== null && paidFrom.getTime() <= now.getTime(),
      earliestDay: romeDay(new Date(now.getTime() + PAID_START_MIN_NOTICE_DAYS * DAY_MS)),
      inFreePeriod,
      freeOnlyByWaiting: paidFrom ? 0 : freeOnlyByWaiting,
      tierChosenInFreePeriod,
    };
  }

  /**
   * Accende gli abbonamenti a pagamento da un giorno (almeno
   * PAID_START_MIN_NOTICE_DAYS giorni dopo), o li rispegne con `day` null.
   * Ogni periodo gratuito arriva almeno a quel giorno e ogni professionista
   * nel periodo gratuito riceve subito l'avviso con la data (o che resta
   * gratis, se si rispegne prima della data); 3 giorni prima il solito
   * avviso di fine periodo gratuito (`runTrialCheck`).
   */
  async setPaidFrom(adminUserId: string, day: string | null, now = new Date()): Promise<AdminPaidStart> {
    const before = await this.paidFrom();
    let paidFrom: Date | null = null;
    if (day !== null) {
      paidFrom = /^\d{4}-\d{2}-\d{2}$/.test(day) ? launchDate(day) : null;
      if (!paidFrom) throw new BadRequestException("Scegli un giorno valido.");
      if (day < romeDay(new Date(now.getTime() + PAID_START_MIN_NOTICE_DAYS * DAY_MS))) {
        throw new BadRequestException(`Scegli un giorno ad almeno ${PAID_START_MIN_NOTICE_DAYS} giorni da oggi: i professionisti devono avere il tempo di scegliere.`);
      }
    }
    if ((before?.getTime() ?? null) === (paidFrom?.getTime() ?? null)) return this.adminPaidStart(now);

    const existing = await this.prisma.subscriptionSettings.findFirst({ select: { id: true } });
    const data = { paidFrom, updatedByUserId: adminUserId };
    const saved = existing
      ? await this.prisma.subscriptionSettings.update({ where: { id: existing.id }, data })
      : await this.prisma.subscriptionSettings.create({ data });
    await this.auditLogService.record({
      entityType: "SubscriptionSettings",
      entityId: saved.id,
      fieldName: "paidFrom",
      oldValue: before?.toISOString() ?? null,
      newValue: paidFrom?.toISOString() ?? null,
      changedByUserId: adminUserId,
    });
    if (paidFrom) await this.alignTrialsToPaidStart(paidFrom);

    // Avviso subito a chi è nel periodo gratuito: la data, o che resta gratis
    // (solo se aveva già ricevuto una data ancora da venire).
    const postponed = !paidFrom && before !== null && before.getTime() > now.getTime();
    if (paidFrom || postponed) {
      const subs = await this.prisma.subscription.findMany({
        where: FREE_PERIOD_WHERE,
        select: { founderNumber: true, trialEndsAt: true, professionalProfile: { select: { userId: true } } },
      });
      for (const sub of subs) {
        try {
          if (paidFrom) {
            // Chi ha mesi gratuiti oltre quel giorno (primi 100) li tiene: gli si dice la sua data.
            const until = sub.trialEndsAt && sub.trialEndsAt.getTime() > paidFrom.getTime() ? sub.trialEndsAt : paidFrom;
            await this.notificationsService.notify(sub.professionalProfile.userId, "SUBSCRIPTION_PAID_START", {
              date: until.toISOString(),
              founder: Boolean(sub.founderNumber),
            });
          } else {
            await this.notificationsService.notify(sub.professionalProfile.userId, "SUBSCRIPTION_PAID_START_POSTPONED", {});
          }
        } catch (error) {
          this.logger.error(`Avviso di partenza dei pagamenti non riuscito per ${sub.professionalProfile.userId}`, error as Error);
        }
      }
    }
    // Pause e limiti seguono subito la scelta, senza aspettare il giro dell'ora.
    await this.runPauseSweep(now);
    return this.adminPaidStart(now);
  }

  /**
   * Con gli abbonamenti a pagamento accesi: nessun periodo gratuito finisce
   * prima del giorno scelto. Idempotente (anche nel giro di ogni ora, per chi
   * si iscrive dopo); l'avviso di fine periodo riparte per la nuova data.
   */
  async alignTrialsToPaidStart(paidFrom: Date): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: { status: "TRIALING", stripeSubscriptionId: null, OR: [{ trialEndsAt: null }, { trialEndsAt: { lt: paidFrom } }] },
      data: { trialEndsAt: paidFrom, trialEndingNotifiedAt: null },
    });
    return result.count;
  }

  /** Avvia la prova gratuita alla creazione del profilo (idempotente): un mese dal lancio, o da oggi dopo il lancio. */
  async ensureTrial(professionalProfileId: string, now = new Date()): Promise<void> {
    const trialEnd = trialEndFor(now, launchDate());
    // Mai prima del giorno in cui partono gli abbonamenti a pagamento.
    const paidFrom = await this.paidFrom();
    await this.prisma.subscription.upsert({
      where: { professionalProfileId },
      create: {
        professionalProfileId,
        plan: "FREE",
        status: "TRIALING",
        trialEndsAt: paidFrom && paidFrom.getTime() > trialEnd.getTime() ? paidFrom : trialEnd,
      },
      update: {},
    });
  }

  /**
   * Offerta di lancio (decisione dell'utente, docs/CHANGELOG.md §363): ai
   * primi 100 professionisti con il profilo completo (non quelli di prova,
   * né dimostrativi né segnati "Account di prova" in Admin, §395, non i
   * profili creati da un operatore finché non li confermano) 3 mesi
   * gratis dal lancio al posto del mese gratuito. Idempotente; chi ha già un
   * abbonamento Stripe o un posto non ne prende un altro. Due iscrizioni
   * nello stesso istante: il numero è unico, la seconda riprova col successivo.
   */
  async claimFounderSpot(professionalProfileId: string, now = new Date()): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const profile = await this.prisma.professionalProfile.findUnique({
        where: { id: professionalProfileId },
        select: { isDemo: true, deletedAt: true, invitePendingAt: true, subscription: true, user: { select: { testAccountAt: true } } },
      });
      const sub = profile?.subscription;
      if (!profile || !sub || profile.isDemo || profile.user.testAccountAt || profile.deletedAt || profile.invitePendingAt) return false;
      if (sub.founderNumber) return true;
      if (sub.status !== "TRIALING" || sub.stripeSubscriptionId) return false;
      // Posti contati, non l'ultimo numero: un account segnato di prova libera il suo (§395).
      const [taken, last] = await Promise.all([
        this.prisma.subscription.count({ where: { founderNumber: { not: null } } }),
        this.prisma.subscription.aggregate({ _max: { founderNumber: true } }),
      ]);
      if (taken >= FOUNDER_SPOTS) return false;
      const next = (last._max.founderNumber ?? 0) + 1;
      // I tre mesi partono dal lancio (o da oggi dopo il lancio), mai prima della prova già data.
      const founderEnd = trialEndFor(now, launchDate(), FOUNDER_TRIAL_DAYS);
      const trialEndsAt = sub.trialEndsAt && sub.trialEndsAt.getTime() > founderEnd.getTime() ? sub.trialEndsAt : founderEnd;
      try {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { founderNumber: next, trialEndsAt } });
        return true;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    return false;
  }

  /** Fondatori in ordine di posto, per l'area admin (§363). */
  async listFounders(now = new Date()): Promise<AdminFounders> {
    const subs = await this.prisma.subscription.findMany({
      where: { founderNumber: { not: null } },
      orderBy: { founderNumber: "asc" },
      include: { professionalProfile: { select: { businessName: true, city: true, createdAt: true, deletedAt: true, user: { select: { email: true } } } } },
    });
    const waitingLaunch = !hasLaunched(now, launchDate());
    return {
      total: FOUNDER_SPOTS,
      taken: subs.length,
      // Posizione in elenco, non il numero salvato: dopo un posto liberato da un account di prova (§395) i numeri hanno un buco.
      rows: subs.map((sub, index) => ({
        number: index + 1,
        businessName: sub.professionalProfile.businessName,
        email: sub.professionalProfile.user.email ?? "",
        city: sub.professionalProfile.city,
        joinedAt: sub.professionalProfile.createdAt.toISOString(),
        freeUntil: waitingLaunch ? null : (sub.trialEndsAt?.toISOString() ?? null),
        tier: tierOfPlan(sub.plan),
        deleted: Boolean(sub.professionalProfile.deletedAt),
      })),
    };
  }

  /** Posti dell'offerta di lancio rimasti (pagina prezzi). */
  async founderSpots(): Promise<FounderSpots> {
    const taken = await this.prisma.subscription.count({ where: { founderNumber: { not: null } } });
    return { total: FOUNDER_SPOTS, left: Math.max(0, FOUNDER_SPOTS - taken) };
  }

  /**
   * Lavori accettati nel periodo in corso (dal rinnovo, docs/CHANGELOG.md
   * §362): prenotazioni nate nel periodo, tranne quelle annullate dal
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
        include: { professionalProfile: { select: { userId: true, user: { select: { testAccountAt: true } } } } },
      });
      if (!sub) return;
      const used = await this.countUsedJobs(professionalProfileId, sub, now);
      // Senza pagamenti attivi, prima del lancio o finché l'admin non accende
      // gli abbonamenti a pagamento non c'è limite né livello superiore: niente avvisi.
      if (!pausesActive(now, freeOnHoldFor(await this.paidFrom(), sub.professionalProfile.user.testAccountAt))) return;
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
   * toglie i lavori esauriti del periodo (§362). Avvisa quando va in pausa
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
    paidFrom?: Date | null,
  ): Promise<{ reason: PauseReason | null; limitReached: boolean }> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { userId: true, isDemo: true, deletedAt: true, pausedReason: true, jobLimitReachedAt: true, subscription: true, user: { select: { testAccountAt: true } } },
    });
    if (!profile || profile.deletedAt) return { reason: null, limitReached: false };
    const active = !profile.isDemo && pausesActive(now, freeOnHoldFor(paidFrom === undefined ? await this.paidFrom() : paidFrom, profile.user.testAccountAt));
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
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, verified: true, identityExpiredAt: true, user: { select: { testAccountAt: true } }, ...PUBLIC_VISIBILITY_SELECT },
    });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato. Completa prima il tuo profilo.");
    const now = new Date();
    const paidFrom = await this.paidFrom();
    const row = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    // Chi ha già un abbonamento pagato (pagamenti rispenti dopo la partenza) lo tiene.
    const paying = Boolean(row?.stripeSubscriptionId) && row?.status !== "CANCELED";
    const freeOnHold = freeOnHoldFor(paidFrom, profile.user.testAccountAt) && !paying;
    // In attesa dei pagamenti il periodo gratuito finito resta gratuito.
    const sub = row ? { ...row, freeOnHold } : null;
    const used = await this.countUsedJobs(profile.id, sub, now);
    const { reason: pausedReason, limitReached } = await this.syncPause(profile.id, now, used, paidFrom);
    const period = usagePeriod(sub, now);
    const launch = launchDate();
    // Prima del lancio la prova non scorre (docs/CHANGELOG.md §170): finisce
    // un mese dopo il lancio, o non ha ancora una data se il lancio non è fissato.
    const waitingLaunch = !hasLaunched(now, launch) && (!sub || sub.status === "TRIALING");
    const state = waitingLaunch ? "TRIAL" : subscriptionState(sub, now);
    const trialEndsAt = waitingLaunch ? (launch ? trialEndFor(now, launch, trialDaysOf(sub)) : null) : (sub?.trialEndsAt ?? null);
    const tier = sub && state !== "TRIAL" && state !== "TRIAL_ENDED" ? tierOfPlan(sub.plan) : null;
    return {
      state,
      tier,
      pausedReason,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      bonusMonthGranted: Boolean(sub?.bonusMonthGrantedAt),
      // Periodo gratuito allungato fino al giorno dei pagamenti: i tre mesi non
      // finiscono più alla data salvata, le caselle dei mesi non hanno senso.
      founder:
        sub?.founderNumber && paidFrom && trialEndsAt?.getTime() === paidFrom.getTime()
          ? { months: FOUNDER_FREE_MONTHS, currentMonth: null }
          : founderFreeMonths(sub?.founderNumber, trialEndsAt, now),
      usage: {
        used,
        // In attesa dei pagamenti nessun limite: non si può passare a un livello superiore.
        limit: freeOnHold ? null : monthlyLimit(sub, now),
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        countsClientsOnce: countsClientsOnce(sub, now),
      },
      limitReached,
      billingInterval: tier && sub ? sub.billingInterval : null,
      upgradeQuotes: freeOnHold ? [] : upgradeQuotes({
        state,
        tier,
        interval: sub?.billingInterval ?? "MONTH",
        waitingLaunch,
        trialEndsAt,
        currentPeriodStart: sub?.currentPeriodStart ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        now,
      }),
      checkoutAvailable: paymentsActive() && !freeOnHold,
      freeUntilPaidStart: freeOnHold,
      paidFrom: paidFrom?.toISOString() ?? null,
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
   * toglie il limite a chi riparte col periodo nuovo (al rinnovo, §362). Scrive solo quando lo stato cambia;
   * i profili sono pochi alla scala di lancio (CLAUDE.md §7).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runPauseSweep(now = new Date()): Promise<void> {
    await this.alignTrialsToLaunch(now);
    const paidFrom = await this.paidFrom();
    if (paidFrom) await this.alignTrialsToPaidStart(paidFrom);
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { deletedAt: null, isDemo: false },
      select: { id: true },
    });
    for (const profile of profiles) {
      try {
        await this.syncPause(profile.id, now, undefined, paidFrom);
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
    // I fondatori hanno tre mesi dal lancio (§363).
    const founderTrialEnd = trialEndFor(launch!, launch, FOUNDER_TRIAL_DAYS);
    const founders = await this.prisma.subscription.updateMany({
      where: { status: "TRIALING", stripeSubscriptionId: null, founderNumber: { not: null }, createdAt: { lt: launch! }, trialEndsAt: { lt: founderTrialEnd } },
      data: { trialEndsAt: founderTrialEnd },
    });
    const result = await this.prisma.subscription.updateMany({
      where: { status: "TRIALING", stripeSubscriptionId: null, founderNumber: null, createdAt: { lt: launch! }, trialEndsAt: { lt: launchTrialEnd } },
      data: { trialEndsAt: launchTrialEnd },
    });
    return founders.count + result.count;
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
    // Finché l'admin non accende gli abbonamenti a pagamento il periodo
    // gratuito non finisce: avvisi e regali solo agli account di prova (collaudo).
    const paidFrom = await this.paidFrom();
    const endingBefore = new Date(now.getTime() + BONUS_MONTH_NOTICE_DAYS * DAY_MS);
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { gt: now, lte: endingBefore },
        OR: [{ bonusMonthGrantedAt: null }, { trialEndingNotifiedAt: null }],
        professionalProfile: { deletedAt: null, ...(paidFrom ? {} : { user: { testAccountAt: { not: null } } }) },
      },
      include: { professionalProfile: { select: { userId: true } } },
    });
    for (const sub of subs) {
      try {
        const userId = sub.professionalProfile.userId;
        // Ai fondatori niente mese a sorpresa: hanno già tre mesi (§363).
        if (!sub.bonusMonthGrantedAt && !sub.founderNumber) {
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
            founder: Boolean(sub.founderNumber),
          });
        }
      } catch (error) {
        this.logger.error(`Controllo fine prova non riuscito per ${sub.id}`, error as Error);
      }
    }
  }
}
