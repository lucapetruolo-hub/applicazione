import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { BONUS_MONTH_DAYS, BONUS_MONTH_NOTICE_DAYS, TRIAL_DAYS, type MySubscription } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import {
  monthlyLimit,
  romeMonthKey,
  romeMonthLabel,
  romeMonthStart,
  subscriptionState,
  tierOfPlan,
  usageNoticeToSend,
} from "./subscription-rules";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md §161):
 * prova gratuita di un mese per tutti, mese regalato a sorpresa a chi non
 * ha ancora avuto lavori, conteggio dei lavori accettati del mese con
 * avvisi all'80% e al 100%. Nessun blocco al limite: cosa succede oltre va
 * ancora deciso con l'utente.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Avvia la prova gratuita alla creazione del profilo (idempotente). */
  async ensureTrial(professionalProfileId: string, now = new Date()): Promise<void> {
    await this.prisma.subscription.upsert({
      where: { professionalProfileId },
      create: {
        professionalProfileId,
        plan: "FREE",
        status: "TRIALING",
        trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
      },
      update: {},
    });
  }

  /**
   * Lavori accettati nel mese (ora italiana): prenotazioni nate nel mese,
   * tranne quelle annullate dal cliente (il professionista non ne ha colpa).
   */
  countAcceptedJobsThisMonth(professionalProfileId: string, now = new Date()): Promise<number> {
    return this.prisma.booking.count({
      where: {
        professionalProfileId,
        createdAt: { gte: romeMonthStart(now) },
        NOT: { status: "CANCELED", canceledBy: "CLIENT" },
      },
    });
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
      const limit = monthlyLimit(sub, now);
      if (limit === null) return;
      const used = await this.countAcceptedJobsThisMonth(professionalProfileId, now);
      const monthKey = romeMonthKey(now);
      const notice = usageNoticeToSend(used, limit, sub.usageNoticeKey, monthKey);
      if (!notice) return;
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { usageNoticeKey: `${monthKey}:${notice}` } });
      await this.notificationsService.notify(
        sub.professionalProfile.userId,
        notice === "100" ? "SUBSCRIPTION_LIMIT_REACHED" : "SUBSCRIPTION_LIMIT_NEAR",
        { used, limit, tier: tierOfPlan(sub.plan) },
      );
    } catch (error) {
      this.logger.error(`Avviso limite abbonamento non riuscito per ${professionalProfileId}`, error as Error);
    }
  }

  async getMySubscription(userId: string): Promise<MySubscription> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato. Completa prima il tuo profilo.");
    const now = new Date();
    const sub = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    const state = subscriptionState(sub, now);
    return {
      state,
      tier: sub && state !== "TRIAL" && state !== "TRIAL_ENDED" ? tierOfPlan(sub.plan) : null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      bonusMonthGranted: Boolean(sub?.bonusMonthGrantedAt),
      usage: {
        acceptedJobsThisMonth: await this.countAcceptedJobsThisMonth(profile.id, now),
        monthlyLimit: monthlyLimit(sub, now),
        monthLabel: romeMonthLabel(now),
      },
      checkoutAvailable: Boolean(process.env.STRIPE_SECRET_KEY),
    };
  }

  /**
   * Ogni giorno: a chi è in prova, a pochi giorni dalla scadenza, senza
   * ancora nessun lavoro → mese regalato (una volta sola). Agli altri,
   * avviso di fine prova. Il regalo a chi paga già il primo mese arriverà
   * con Stripe attivo.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runTrialCheck(now = new Date()): Promise<void> {
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
            await this.notificationsService.notify(userId, "SUBSCRIPTION_BONUS_MONTH", { trialEndsAt: trialEndsAt.toISOString() });
            continue;
          }
        }
        if (!sub.trialEndingNotifiedAt) {
          await this.prisma.subscription.update({ where: { id: sub.id }, data: { trialEndingNotifiedAt: now } });
          await this.notificationsService.notify(userId, "SUBSCRIPTION_TRIAL_ENDING", { trialEndsAt: sub.trialEndsAt!.toISOString() });
        }
      } catch (error) {
        this.logger.error(`Controllo fine prova non riuscito per ${sub.id}`, error as Error);
      }
    }
  }
}
