import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { formatAppointmentDate, wallClockToday } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { GuidedRequestsService } from "../guided-requests/guided-requests.service";

const DAY_MS = 86_400_000;

/**
 * "Metti in pausa" (collaudo C-16, migliorie scelte da Luca il 02/11/2026,
 * docs/changelog/2026-11-02-iscrizione-verifica-professionisti.md): il giorno
 * prima del ritorno un avviso (sito + email, "Promemoria e agenda"), e alla
 * fine della pausa le richieste ancora aperte della sua zona, come a chi si
 * iscrive dopo una richiesta (§271).
 */
@Injectable()
export class AwayService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly guidedRequestsService: GuidedRequestsService,
  ) {}

  @Cron("0 10 * * *", { timeZone: "Europe/Rome" })
  async remindEnding(now: Date = new Date()): Promise<void> {
    // `awayUntil` è la mezzanotte del giorno di ritorno nell'ora "dell'orologio".
    const tomorrow = new Date(wallClockToday(now).getTime() + DAY_MS);
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        awayUntil: { gte: tomorrow, lt: new Date(tomorrow.getTime() + DAY_MS) },
        awayReminderSentAt: null,
        deletedAt: null,
        suspendedAt: null,
        user: { suspendedAt: null },
      },
      select: { id: true, userId: true, awayUntil: true },
    });
    for (const profile of profiles) {
      // Segnato prima dell'avviso: se il giro si ripete, nessuno lo riceve due volte.
      const marked = await this.prisma.professionalProfile.updateMany({
        where: { id: profile.id, awayUntil: profile.awayUntil, awayReminderSentAt: null },
        data: { awayReminderSentAt: now },
      });
      if (marked.count === 0 || !profile.awayUntil) continue;
      await this.notificationsService.notify(profile.userId, "AWAY_ENDING", {
        awayUntil: profile.awayUntil.toISOString(),
        dayLabel: formatAppointmentDate(profile.awayUntil.toISOString(), { weekday: "long", day: "numeric", month: "long" }),
      });
    }
  }

  /** Pause finite: il campo si azzera e arrivano le richieste aperte della zona. */
  @Cron(CronExpression.EVERY_HOUR)
  async endPauses(now: Date = new Date()): Promise<void> {
    const ended = await this.prisma.professionalProfile.findMany({
      where: { awayUntil: { lte: now } },
      select: { id: true, awayUntil: true },
    });
    for (const profile of ended) {
      const cleared = await this.prisma.professionalProfile.updateMany({
        where: { id: profile.id, awayUntil: profile.awayUntil },
        data: { awayUntil: null, awayReminderSentAt: null },
      });
      if (cleared.count > 0) await this.guidedRequestsService.matchWhenVisible(profile.id);
    }
  }
}
