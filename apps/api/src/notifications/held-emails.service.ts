import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { heldEmailGroups } from "./email-hold";
import { NotificationsService } from "./notifications.service";

/**
 * Manda le email rimandate (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md):
 * alle 19 il riassunto degli avvisi senza fretta, alle 7 quelle arrivate di
 * notte. Ogni riga si prende una volta sola (si azzera `emailHoldUntil`
 * prima di mandare). Se per una persona non c'è niente, nessuna email.
 */
@Injectable()
export class HeldEmailsService {
  private readonly logger = new Logger(HeldEmailsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDue(now: Date = new Date()): Promise<void> {
    const rows = await this.prisma.notification.findMany({
      where: { emailHoldUntil: { lte: now } },
      select: { id: true, userId: true, type: true, payload: true, createdAt: true, readAt: true },
      orderBy: { createdAt: "asc" },
      take: 2000,
    });
    if (rows.length === 0) return;
    await this.prisma.notification.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { emailHoldUntil: null } });
    for (const [userId, list] of heldEmailGroups(rows)) {
      try {
        await this.notificationsService.sendHeldEmails(userId, list, now);
      } catch (err) {
        this.logger.error(`Email rimandate non inviate: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
