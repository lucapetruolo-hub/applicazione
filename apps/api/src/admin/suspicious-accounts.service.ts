import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  adminCan,
  adviseSuspiciousUser,
  sortSuspiciousUsers,
  type AdminRoleValue,
  type AdminSignalRole,
  type AdminSuspiciousUsers,
  type AdminUserSignal,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { loadUserSignals, personLabel } from "./user-signals";

const CHECK_ID = "ultimo";

/**
 * Account sospetti (docs/changelog/2026-10-30-admin-persone.md): il controllo
 * gira ogni mattina alle 7 e salva segnali e consiglio di ogni account; le
 * pagine admin leggono il risultato salvato. Chi compare per la prima volta
 * con qualcosa da fare (consiglio "Da fare subito" o "Da guardare") arriva ai
 * moderatori in un avviso, con il consiglio già scritto (proposte accolte da
 * Luca il 30/10/2026).
 */
@Injectable()
export class SuspiciousAccountsService {
  private readonly logger = new Logger(SuspiciousAccountsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Ricalcola e salva. Con `notify` avvisa i moderatori dei nuovi casi. */
  async check(options: { notify: boolean }, now: Date = new Date()): Promise<{ accounts: number; notified: number }> {
    const { signals, people } = await loadUserSignals(this.prisma, now);
    const existing = await this.prisma.suspiciousAccount.findMany({ select: { userId: true } });
    const stale = existing.map((row) => row.userId).filter((id) => !signals.has(id));
    await this.prisma.$transaction([
      this.prisma.suspiciousAccount.deleteMany({ where: { userId: { in: stale } } }),
      ...[...signals.entries()].map(([userId, list]) =>
        this.prisma.suspiciousAccount.upsert({
          where: { userId },
          create: { userId, signals: list, checkedAt: now, firstSeenAt: now },
          update: { signals: list, checkedAt: now },
        }),
      ),
      this.prisma.suspiciousAccountsCheck.upsert({ where: { id: CHECK_ID }, create: { id: CHECK_ID, checkedAt: now }, update: { checkedAt: now } }),
    ]);

    let notified = 0;
    if (options.notify) {
      const pending = await this.prisma.suspiciousAccount.findMany({ where: { notifiedAt: null }, select: { userId: true, signals: true } });
      const toTell = pending
        .map((row) => {
          const person = people.get(row.userId);
          return person ? { userId: row.userId, label: person.label, advice: adviseSuspiciousUser(person.role, row.signals as AdminUserSignal[]) } : null;
        })
        // "Nessuna azione" (es. stessa famiglia) non merita un avviso; se un giorno sale, arriva allora.
        .filter((row): row is NonNullable<typeof row> => row !== null && row.advice.level !== "BASSA");
      if (toTell.length > 0) {
        const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
        const payload = {
          accounts: sortSuspiciousUsers(toTell.map((row) => ({ ...row, signals: [] }))).map((row) => ({ label: row.label, level: row.advice.level, text: row.advice.text })),
        };
        for (const admin of admins) {
          if (!adminCan(admin.adminRoles as AdminRoleValue[], "MODERATION")) continue;
          await this.notificationsService.notify(admin.id, "ADMIN_SUSPICIOUS_ACCOUNTS", payload);
          notified += 1;
        }
        await this.prisma.suspiciousAccount.updateMany({ where: { userId: { in: toTell.map((row) => row.userId) } }, data: { notifiedAt: now } });
        this.logger.log(`Account sospetti nuovi: ${toTell.length}, avvisati ${notified} admin.`);
      }
    }
    return { accounts: signals.size, notified };
  }

  @Cron("0 7 * * *", { timeZone: "Europe/Rome" })
  async morningCheck(now: Date = new Date()): Promise<{ accounts: number; notified: number }> {
    return this.check({ notify: true }, now);
  }

  /** Elenco per Persone → Account sospetti, prima i consigli più urgenti. */
  async list(): Promise<AdminSuspiciousUsers> {
    const [rows, last] = await Promise.all([
      this.prisma.suspiciousAccount.findMany({ select: { userId: true, signals: true, firstSeenAt: true } }),
      this.prisma.suspiciousAccountsCheck.findUnique({ where: { id: CHECK_ID } }),
    ]);
    // Un account chiuso o segnato di prova dopo il controllo non si mostra più.
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) }, deletedAt: null, testAccountAt: null },
      select: { id: true, role: true, name: true, surname: true, email: true, professionalProfile: { select: { businessName: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const list = rows.flatMap((row) => {
      const user = byId.get(row.userId);
      if (!user) return [];
      const signals = row.signals as AdminUserSignal[];
      const role = user.role as AdminSignalRole;
      return [{ id: user.id, label: personLabel(user), role, signals, advice: adviseSuspiciousUser(role, signals), firstSeenAt: row.firstSeenAt.toISOString() }];
    });
    return { checkedAt: last?.checkedAt.toISOString() ?? null, users: sortSuspiciousUsers(list) };
  }
}
