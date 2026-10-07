import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { BAD_WORK_REPORT_DAYS } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { TimelineService } from "../timeline/timeline.service";

const DAY_MS = 24 * 60 * 60 * 1000;

// Solo una parte ha cliccato "Lavoro terminato" (docs/CHANGELOG.md §187,
// decisione dell'utente): promemoria all'altra parte e chiusura d'ufficio
// allo scadere dello stesso termine entro cui si può segnalare un lavoro
// fatto male, così nessuno perde il diritto al reclamo.
export const COMPLETION_AUTO_CLOSE_DAYS = BAD_WORK_REPORT_DAYS;
export const COMPLETION_REMINDER_DAYS = [3, COMPLETION_AUTO_CLOSE_DAYS - 4];

/** Cosa fare oggi per un lavoro chiuso da una sola parte da `since`. */
export function completionDeadlineStep(since: Date, reminderCount: number, now: Date): "REMIND" | "CLOSE" | null {
  const elapsedDays = (now.getTime() - since.getTime()) / DAY_MS;
  if (elapsedDays >= COMPLETION_AUTO_CLOSE_DAYS) return "CLOSE";
  const due = COMPLETION_REMINDER_DAYS.filter((day) => elapsedDays >= day).length;
  return reminderCount < due ? "REMIND" : null;
}

@Injectable()
export class CompletionDeadlineService {
  private readonly logger = new Logger(CompletionDeadlineService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: TimelineService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(now: Date = new Date()): Promise<void> {
    await this.clientSilent(now);
    await this.professionalSilent(now);
  }

  private deadlineOf(since: Date): string {
    return new Date(since.getTime() + COMPLETION_AUTO_CLOSE_DAYS * DAY_MS).toISOString();
  }

  /**
   * Il professionista ha chiuso, il cliente tace: promemoria, poi il lavoro
   * vale come confermato anche dal cliente. Il pagamento non cambia: online
   * l'accredito segue già i suoi 7 giorni, il pagamento diretto resta da
   * confermare. Con una segnalazione aperta decide la segnalazione.
   */
  private async clientSilent(now: Date): Promise<void> {
    const bookings = await this.prisma.booking.findMany({
      where: { status: "COMPLETED", professionalCompletedAt: { not: null }, clientConfirmedCompletedAt: null, completionAutoClosedAt: null, issue: { is: null } },
      select: { id: true, clientId: true, professionalProfileId: true, professionalCompletedAt: true, completionReminderCount: true, quote: { select: { guidedRequestId: true } } },
    });
    for (const booking of bookings) {
      const since = booking.professionalCompletedAt!;
      const step = completionDeadlineStep(since, booking.completionReminderCount, now);
      const guidedRequestId = booking.quote?.guidedRequestId ?? null;
      if (step === "REMIND") {
        await this.prisma.booking.update({ where: { id: booking.id }, data: { completionReminderCount: { increment: 1 } } });
        await this.notificationsService.notify(booking.clientId, "JOB_CONFIRM_REMINDER", { bookingId: booking.id, guidedRequestId, deadline: this.deadlineOf(since) });
      } else if (step === "CLOSE") {
        const { count } = await this.prisma.booking.updateMany({
          where: { id: booking.id, clientConfirmedCompletedAt: null, completionAutoClosedAt: null },
          data: { clientConfirmedCompletedAt: now, completionAutoClosedAt: now },
        });
        if (count === 0) continue;
        if (guidedRequestId) {
          await this.timelineService.log(
            guidedRequestId,
            booking.professionalProfileId,
            "SYSTEM",
            `Il cliente non ha confermato né segnalato problemi entro ${COMPLETION_AUTO_CLOSE_DAYS} giorni: il lavoro è considerato terminato.`,
          );
        }
        await this.notificationsService.notify(booking.clientId, "JOB_AUTO_CONFIRMED", { bookingId: booking.id, guidedRequestId });
        this.logger.log(`Lavoro ${booking.id} chiuso d'ufficio dal lato cliente.`);
      }
    }
  }

  /**
   * Il cliente ha chiuso, il professionista tace: promemoria, poi la
   * recensione del cliente non aspetta più. Il lavoro resta aperto perché
   * l'importo finale lo inserisce solo il professionista: se ci sono soldi
   * online in custodia lo diciamo al nostro team.
   */
  private async professionalSilent(now: Date): Promise<void> {
    const bookings = await this.prisma.booking.findMany({
      where: { status: "CONFIRMED", clientConfirmedCompletedAt: { not: null }, completionAutoClosedAt: null, issue: { is: null } },
      select: {
        id: true,
        professionalProfileId: true,
        clientConfirmedCompletedAt: true,
        completionReminderCount: true,
        quote: { select: { guidedRequestId: true } },
        professionalProfile: { select: { userId: true } },
        jobPayment: { select: { paymentMethod: true, paidEurCents: true, refundedEurCents: true } },
      },
    });
    for (const booking of bookings) {
      const since = booking.clientConfirmedCompletedAt!;
      const step = completionDeadlineStep(since, booking.completionReminderCount, now);
      const guidedRequestId = booking.quote?.guidedRequestId ?? null;
      const proUserId = booking.professionalProfile.userId;
      if (step === "REMIND") {
        await this.prisma.booking.update({ where: { id: booking.id }, data: { completionReminderCount: { increment: 1 } } });
        await this.notificationsService.notify(proUserId, "JOB_CLOSE_REMINDER", { bookingId: booking.id, guidedRequestId, deadline: this.deadlineOf(since) });
      } else if (step === "CLOSE") {
        const { count } = await this.prisma.booking.updateMany({
          where: { id: booking.id, status: "CONFIRMED", completionAutoClosedAt: null },
          data: { completionAutoClosedAt: now },
        });
        if (count === 0) continue;
        if (guidedRequestId) {
          await this.timelineService.log(
            guidedRequestId,
            booking.professionalProfileId,
            "SYSTEM",
            `Il professionista non ha segnato il lavoro come terminato entro ${COMPLETION_AUTO_CLOSE_DAYS} giorni dalla conferma del cliente.`,
          );
        }
        await this.notificationsService.notify(proUserId, "JOB_CLOSE_EXPIRED", { bookingId: booking.id, guidedRequestId });
        const jp = booking.jobPayment;
        if (jp?.paymentMethod === "MANOVIA" && jp.paidEurCents > jp.refundedEurCents) {
          await this.notifyFinanceAdmins(booking.id);
        }
        this.logger.log(`Lavoro ${booking.id}: termine scaduto senza chiusura del professionista.`);
      }
    }
  }

  private async notifyFinanceAdmins(bookingId: string): Promise<void> {
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER") || roles.includes("FINANCE")) {
        await this.notificationsService.notify(admin.id, "ADMIN_JOB_NOT_CLOSED", { bookingId });
      }
    }
  }
}
