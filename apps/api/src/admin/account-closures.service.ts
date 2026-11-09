import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { DELETED_EMAIL_HASH_RETENTION_YEARS } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { ScheduledJob } from "../common/scheduled-job";

/**
 * Lavori notturni sugli account (controllo pre-lancio dell'08/11/2026):
 * - chiude gli account con la chiusura fissata da Admin 30 giorni prima
 *   (E4-03, Termini punto 10, Reg. UE 2019/1150 art. 4 c. 2): l'account si
 *   blocca come una sospensione e la persona riceve l'email "Account chiuso";
 * - cancella l'impronta dell'email degli account chiusi da più di
 *   DELETED_EMAIL_HASH_RETENTION_YEARS anni (E4-06, Privacy punto 5).
 */
@Injectable()
export class AccountClosuresService {
  private readonly logger = new Logger(AccountClosuresService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @ScheduledJob("30 5 * * *")
  async nightly(now: Date = new Date()): Promise<{ closed: number; hashesCleared: number }> {
    const closed = await this.closeDue(now);
    const hashesCleared = await this.clearOldEmailHashes(now);
    if (closed || hashesCleared) this.logger.log(`Account chiusi: ${closed}; impronte email cancellate: ${hashesCleared}`);
    return { closed, hashesCleared };
  }

  async closeDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { closureScheduledAt: { lte: now }, suspendedAt: null, deletedAt: null },
      select: { id: true, suspensionNote: true, suspensionGround: true },
      take: 200,
    });
    let closed = 0;
    for (const user of due) {
      // Un admin che annulla la chiusura nello stesso momento vince: si chiude solo se è ancora fissata.
      const updated = await this.prisma.user.updateMany({ where: { id: user.id, closureScheduledAt: { lte: now }, suspendedAt: null }, data: { suspendedAt: now } });
      if (updated.count === 0) continue;
      await this.prisma.professionalProfile.updateMany({ where: { userId: user.id, suspendedAt: null }, data: { suspendedAt: now } });
      await this.auditLogService.record({ entityType: "User", entityId: user.id, fieldName: "suspendedAt", newValue: "CLOSED", changedByUserId: null, reason: "Chiusura con preavviso arrivata alla data" });
      await this.notificationsService.notify(user.id, "ACCOUNT_CLOSED", { note: user.suspensionNote, ground: user.suspensionGround });
      closed += 1;
    }
    return closed;
  }

  async clearOldEmailHashes(now: Date = new Date()): Promise<number> {
    const limit = new Date(now);
    limit.setUTCFullYear(limit.getUTCFullYear() - DELETED_EMAIL_HASH_RETENTION_YEARS);
    const result = await this.prisma.user.updateMany({ where: { deletedEmailHash: { not: null }, deletedAt: { lt: limit } }, data: { deletedEmailHash: null } });
    return result.count;
  }
}
