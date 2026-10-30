import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  DEFAULT_FREE_MONTHS,
  FOUNDER_SPOTS,
  MAX_OFFER_FREE_MONTHS,
  RENEWAL_NOTICE_DAYS,
  TRIAL_DAYS,
  TRIAL_ENDING_NOTICE_DAYS,
  subscriptionTierInfo,
  tierPeriodPriceEurCents,
  type MySubscription,
  type BillingInterval,
  type AdminFounders,
  type AdminSubscriptionOffer,
  type FounderSpots,
  type AdminProfessionalWithoutCard,
  type PauseReason,
  type SubscriptionTier,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { PUBLIC_VISIBILITY_SELECT, publicVisibilityMissing } from "../professional-fiscal/public-visibility";
import { identityVerificationNeeded } from "../identity-verification/identity-provider-env";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { COUNTED_USER } from "../site-counts/counted";
import {
  countsClientsOnce,
  freeMonthsLeftAfterCurrent,
  freeMonthsOf,
  freeMonthsProgress,
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
 */
function pausesActive(now: Date): boolean {
  return paymentsActive() && hasLaunched(now, launchDate());
}

/**
 * Abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md §161):
 * mesi gratis dell'offerta decisa in Admin (docs/changelog/2026-10-29-offerta-mesi-gratis.md),
 * conteggio dei lavori accettati del periodo (dal
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
   * Offerta dei mesi gratis attiva (decisione di Luca del 29/10/2026,
   * docs/changelog/2026-10-29-offerta-mesi-gratis.md): l'ultima creata in
   * Admin se non è fermata; senza nessuna offerta, quella di partenza da 3
   * mesi. Null se Luca l'ha fermata.
   */
  async activeOffer(): Promise<{ id: string | null; freeMonths: number; startedAt: Date | null } | null> {
    const last = await this.prisma.subscriptionOffer.findFirst({ orderBy: { startedAt: "desc" } });
    if (!last) return { id: null, freeMonths: DEFAULT_FREE_MONTHS, startedAt: null };
    return last.stoppedAt ? null : { id: last.id, freeMonths: last.freeMonths, startedAt: last.startedAt };
  }

  /**
   * Mesi gratis alla creazione del profilo (idempotente): quelli dell'offerta
   * attiva, dal lancio o da oggi dopo il lancio. A offerta fermata nessun mese
   * gratis: prima del lancio non si paga comunque, dopo serve un livello.
   */
  async ensureTrial(professionalProfileId: string, now = new Date()): Promise<void> {
    const existing = await this.prisma.subscription.findUnique({ where: { professionalProfileId }, select: { id: true } });
    if (existing) return;
    const offer = await this.activeOffer();
    const freeMonths = offer?.freeMonths ?? 0;
    await this.prisma.subscription.upsert({
      where: { professionalProfileId },
      create: {
        professionalProfileId,
        plan: "FREE",
        status: "TRIALING",
        trialEndsAt: trialEndFor(now, launchDate(), freeMonths * TRIAL_DAYS),
        freeMonthsGranted: freeMonths,
        offerId: offer?.id ?? null,
      },
      update: {},
    });
  }

  /** Offerta, storico e iscritti per Admin → Profili da confermare. */
  async getOfferAdmin(now = new Date()): Promise<AdminSubscriptionOffer> {
    const [offers, current] = await Promise.all([this.prisma.subscriptionOffer.findMany({ orderBy: { startedAt: "desc" }, take: 20 }), this.activeOffer()]);
    const since = current?.startedAt ?? null;
    const professional = { deletedAt: null, isDemo: false, user: COUNTED_USER };
    const client = { role: "CLIENT" as const, deletedAt: null, ...COUNTED_USER };
    const [professionals, professionalsSince, clients, clientsSince, inFreeMonths, withWaitingMonths] = await Promise.all([
      this.prisma.professionalProfile.count({ where: professional }),
      since ? this.prisma.professionalProfile.count({ where: { ...professional, createdAt: { gte: since } } }) : Promise.resolve(null),
      this.prisma.user.count({ where: client }),
      since ? this.prisma.user.count({ where: { ...client, createdAt: { gte: since } } }) : Promise.resolve(null),
      this.prisma.subscription.count({ where: { trialEndsAt: { gt: now }, status: { not: "CANCELED" }, professionalProfile: professional } }),
      this.prisma.subscription.count({ where: { freeMonthsWaiting: { gt: 0 }, professionalProfile: professional } }),
    ]);
    return {
      current: current ? { freeMonths: current.freeMonths, startedAt: current.startedAt?.toISOString() ?? null } : null,
      history: offers.map((offer) => ({ freeMonths: offer.freeMonths, startedAt: offer.startedAt.toISOString(), stoppedAt: offer.stoppedAt?.toISOString() ?? null })),
      signups: {
        professionals: { total: professionals, sinceOffer: professionalsSince },
        clients: { total: clients, sinceOffer: clientsSince },
      },
      inFreeMonths,
      withWaitingMonths,
    };
  }

  /** Ferma l'offerta: chi è già iscritto tiene i suoi mesi, chi arriva dopo non ne ha. */
  async stopOffer(adminUserId: string, now = new Date()): Promise<AdminSubscriptionOffer> {
    const current = await this.activeOffer();
    if (!current) throw new BadRequestException("L'offerta è già ferma.");
    // L'offerta di partenza non ha una riga: la si scrive già fermata, così resta nello storico.
    const offer = current.id
      ? await this.prisma.subscriptionOffer.update({ where: { id: current.id }, data: { stoppedAt: now, stoppedByUserId: adminUserId } })
      : await this.prisma.subscriptionOffer.create({ data: { freeMonths: current.freeMonths, startedAt: new Date(0), stoppedAt: now, stoppedByUserId: adminUserId } });
    await this.auditLogService.record({ entityType: "SubscriptionOffer", entityId: offer.id, fieldName: "stoppedAt", newValue: "STOPPED", changedByUserId: adminUserId });
    return this.getOfferAdmin(now);
  }

  /** Nuova offerta da N mesi gratis per chi si iscrive da adesso; quella attiva si ferma. */
  async startOffer(adminUserId: string, freeMonths: number, now = new Date()): Promise<AdminSubscriptionOffer> {
    if (!Number.isInteger(freeMonths) || freeMonths < 1 || freeMonths > MAX_OFFER_FREE_MONTHS) {
      throw new BadRequestException(`Scegli da 1 a ${MAX_OFFER_FREE_MONTHS} mesi gratis.`);
    }
    if (await this.activeOffer()) await this.stopOffer(adminUserId, now);
    const offer = await this.prisma.subscriptionOffer.create({ data: { freeMonths, startedAt: now, createdByUserId: adminUserId } });
    await this.auditLogService.record({ entityType: "SubscriptionOffer", entityId: offer.id, fieldName: "freeMonths", newValue: String(freeMonths), changedByUserId: adminUserId });
    return this.getOfferAdmin(now);
  }

  /**
   * Offerta di lancio (decisione dell'utente, docs/CHANGELOG.md §363): un
   * posto numerato ai primi 100 professionisti con il profilo completo (non
   * quelli di prova, né dimostrativi né segnati "Account di prova" in Admin,
   * §395, non i profili creati da un operatore finché non li confermano).
   * Dal 29/10/2026 i mesi gratis li dà l'offerta a tutti
   * (docs/changelog/2026-10-29-offerta-mesi-gratis.md): il posto serve solo
   * alla scritta "100 posti" della pagina prezzi e all'elenco in Admin.
   * Idempotente; due iscrizioni nello stesso istante: il numero è unico, la
   * seconda riprova col successivo.
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
      // Con la carta data (abbonamento Base di Stripe nei mesi gratis) il posto vale lo stesso.
      if (sub.status === "CANCELED" || (sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime())) return false;
      // Posti contati, non l'ultimo numero: un account segnato di prova libera il suo (§395).
      const [taken, last] = await Promise.all([
        this.prisma.subscription.count({ where: { founderNumber: { not: null } } }),
        this.prisma.subscription.aggregate({ _max: { founderNumber: true } }),
      ]);
      if (taken >= FOUNDER_SPOTS) return false;
      const next = (last._max.founderNumber ?? 0) + 1;
      try {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { founderNumber: next } });
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
  /**
   * Profili senza la carta per i mesi gratis (docs/changelog/2026-10-30-iscrizione-carta-solida.md):
   * l'elenco da chiamare in Admin, i più vecchi prima. Senza account di prova,
   * dimostrativi, chiusi o creati da un operatore e non ancora confermati.
   */
  async professionalsWithoutCard(): Promise<AdminProfessionalWithoutCard[]> {
    const rows = await this.prisma.professionalProfile.findMany({
      where: {
        isDemo: false,
        deletedAt: null,
        invitePendingAt: null,
        user: { ...COUNTED_USER, deletedAt: null },
        subscription: { status: "TRIALING", stripeSubscriptionId: null },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { userId: true, businessName: true, city: true, createdAt: true, user: { select: { name: true, email: true, phone: true } } },
    });
    const reminders = rows.length
      ? await this.prisma.notification.groupBy({ by: ["userId"], where: { userId: { in: rows.map((r) => r.userId) }, type: "PROFILE_SETUP_REMINDER" }, _count: { _all: true } })
      : [];
    const sent = new Map(reminders.map((r) => [r.userId, r._count._all]));
    return rows.map((row) => ({
      userId: row.userId,
      businessName: row.businessName,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
      city: row.city,
      profileCreatedAt: row.createdAt.toISOString(),
      remindersSent: sent.get(row.userId) ?? 0,
    }));
  }

  async founderSpots(): Promise<FounderSpots> {
    const [taken, offer] = await Promise.all([this.prisma.subscription.count({ where: { founderNumber: { not: null } } }), this.activeOffer()]);
    return { total: FOUNDER_SPOTS, left: Math.max(0, FOUNDER_SPOTS - taken), offerMonths: offer?.freeMonths ?? null };
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
    if (pauseChanged && reason) {
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
      freeMonths: freeMonthsProgress(sub ? freeMonthsOf(sub) : 0, trialEndsAt, now),
      freeMonthsWaiting: sub?.freeMonthsWaiting ?? 0,
      returnToBase: Boolean(sub?.returnToBaseAt),
      cardNeeded: state === "TRIAL" && !sub?.stripeSubscriptionId,
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
   *
   * Mesi gratis (docs/changelog/2026-10-29-offerta-mesi-gratis.md): finché
   * Stripe è in prova, la fine dei giorni gratis è la sua. Se l'abbonamento
   * diventa pagato mentre i mesi gratis scorrono (passaggio a Plus o Pro), i
   * mesi dopo quello in corso vanno in attesa e il periodo pagato parte da
   * oggi con 0 lavori. Ripresi con un nuovo giro gratis (ritorno a Base),
   * l'attesa si azzera e il giro vale quei mesi.
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
    /** Fine della prova di Stripe se è ancora in prova, altrimenti null. */
    stripeTrialEnd?: Date | null;
  }): Promise<void> {
    const row =
      (await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: input.stripeSubscriptionId } })) ??
      (input.professionalProfileId ? await this.prisma.subscription.findUnique({ where: { professionalProfileId: input.professionalProfileId } }) : null);
    if (!row) return;
    if (row.stripeSubscriptionId && row.stripeSubscriptionId !== input.stripeSubscriptionId && row.status !== "CANCELED") return;
    const now = new Date();
    const freeRunning = row.trialEndsAt !== null && row.trialEndsAt.getTime() > now.getTime();
    let freeMonths: { trialEndsAt?: Date; freeMonthsWaiting?: number; freeMonthsGranted?: number } = {};
    if (input.stripeTrialEnd && input.stripeTrialEnd.getTime() > now.getTime()) {
      if (!freeRunning && row.freeMonthsWaiting > 0) {
        freeMonths = { trialEndsAt: input.stripeTrialEnd, freeMonthsWaiting: 0, freeMonthsGranted: row.freeMonthsWaiting };
      } else {
        freeMonths = { trialEndsAt: input.stripeTrialEnd };
      }
    } else if (input.status === "ACTIVE" && freeRunning) {
      const left = freeMonthsLeftAfterCurrent(freeMonthsOf(row), row.trialEndsAt, now);
      freeMonths = { trialEndsAt: now, freeMonthsWaiting: row.freeMonthsWaiting + left };
    }
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
        ...freeMonths,
        // Abbonamento concluso: niente ritorno a Base in sospeso.
        ...(input.status === "CANCELED" ? { returnToBaseAt: null } : {}),
        // Prima carta data (imbuto dell'iscrizione, docs/changelog/2026-10-30-iscrizione-carta-solida.md).
        ...(!row.cardAddedAt && input.status === "ACTIVE" ? { cardAddedAt: now } : {}),
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
   * Dal lancio in poi: chi era nei mesi gratis da prima del lancio senza la
   * carta li finisce dal lancio (docs/CHANGELOG.md §170). Chi ha dato la
   * carta ha già la fine giusta su Stripe. Idempotente.
   */
  async alignTrialsToLaunch(now = new Date()): Promise<number> {
    const launch = launchDate();
    if (!hasLaunched(now, launch)) return 0;
    const rows = await this.prisma.subscription.findMany({
      where: { status: "TRIALING", stripeSubscriptionId: null, createdAt: { lt: launch! } },
      select: { id: true, trialEndsAt: true, freeMonthsGranted: true },
    });
    let updated = 0;
    for (const row of rows) {
      const end = trialEndFor(launch!, launch, freeMonthsOf(row) * TRIAL_DAYS);
      if (row.trialEndsAt && row.trialEndsAt.getTime() >= end.getTime()) continue;
      await this.prisma.subscription.update({ where: { id: row.id }, data: { trialEndsAt: end } });
      updated++;
    }
    return updated;
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
   * Ogni giorno: avviso di fine dei mesi gratis a chi non ha dato la carta
   * (chi l'ha data riceve l'avviso di rinnovo di Base, runPeriodNotices). Il
   * mese regalato a sorpresa non c'è più: i mesi gratis li decide l'offerta
   * (docs/changelog/2026-10-29-offerta-mesi-gratis.md).
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runTrialCheck(now = new Date()): Promise<void> {
    // Prima del lancio i mesi gratis non scorrono: nessun avviso.
    if (!hasLaunched(now, launchDate())) return;
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: "TRIALING",
        trialEndsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_ENDING_NOTICE_DAYS * DAY_MS) },
        trialEndingNotifiedAt: null,
        professionalProfile: { deletedAt: null },
      },
      include: { professionalProfile: { select: { userId: true } } },
    });
    for (const sub of subs) {
      try {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { trialEndingNotifiedAt: now } });
        await this.notificationsService.notify(sub.professionalProfile.userId, "SUBSCRIPTION_TRIAL_ENDING", {
          trialEndsAt: sub.trialEndsAt!.toISOString(),
          date: sub.trialEndsAt!.toISOString(),
          freeMonths: freeMonthsOf(sub),
        });
      } catch (error) {
        this.logger.error(`Controllo fine mesi gratis non riuscito per ${sub.id}`, error as Error);
      }
    }
  }
}
