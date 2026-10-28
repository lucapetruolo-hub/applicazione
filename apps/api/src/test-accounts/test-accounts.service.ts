import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";

/**
 * "Account di prova" (richiesta di Luca, docs/CHANGELOG.md §395): un super
 * admin segna gli account che usa per provare il sito. Restano account
 * normali (si entra, si prova tutto), ma non contano mai nei numeri e non
 * prendono un posto dei "primi 100". Segnarlo libera il posto; togliere il
 * segno lo fa riprovare a prendere, se ce ne sono ancora.
 */
@Injectable()
export class TestAccountsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async setTestAccount(adminUserId: string, userId: string, testAccount: boolean): Promise<{ id: string; testAccountAt: string | null }> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, testAccountAt: true, professionalProfile: { select: { id: true, invitePendingAt: true } } },
    });
    if (!target) throw new NotFoundException("Utente non trovato.");
    if (target.role === "ADMIN") throw new BadRequestException("Gli amministratori non sono mai contati nei numeri: non serve segnarli.");
    if (Boolean(target.testAccountAt) === testAccount) return { id: userId, testAccountAt: target.testAccountAt?.toISOString() ?? null };

    const testAccountAt = testAccount ? new Date() : null;
    await this.prisma.user.update({ where: { id: userId }, data: { testAccountAt } });
    const profile = target.professionalProfile;
    if (profile && testAccount) {
      await this.prisma.subscription.updateMany({ where: { professionalProfileId: profile.id, founderNumber: { not: null } }, data: { founderNumber: null } });
    } else if (profile && !profile.invitePendingAt) {
      await this.subscriptionsService.claimFounderSpot(profile.id);
    }
    await this.auditLogService.record({
      entityType: "User",
      entityId: userId,
      fieldName: "testAccount",
      oldValue: target.email ?? null,
      newValue: testAccount ? "MARKED" : "UNMARKED",
      changedByUserId: adminUserId,
    });
    return { id: userId, testAccountAt: testAccountAt?.toISOString() ?? null };
  }
}
