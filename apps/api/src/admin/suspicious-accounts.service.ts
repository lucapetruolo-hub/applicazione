import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  adminCan,
  adviseSuspiciousUser,
  hasNewSignals,
  signalKey,
  sortSuspiciousUsers,
  type AdminRoleValue,
  type AdminSignalRole,
  type AdminSuspiciousUsers,
  type AdminUserSignal,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { loadUserSignals, personLabel } from "./user-signals";

const CHECK_ID = "ultimo";
/** Stessa chiave della coda "Da fare" (admin-queue.service.ts). */
const claimKey = (userId: string) => `SUSPICIOUS_ACCOUNT:${userId}`;

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
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Ricalcola e salva. Con `notify` avvisa i moderatori dei nuovi casi. */
  async check(options: { notify: boolean }, now: Date = new Date()): Promise<{ accounts: number; notified: number }> {
    const { signals, people } = await loadUserSignals(this.prisma, now);
    const existing = await this.prisma.suspiciousAccount.findMany({ select: { userId: true, dismissedAt: true, dismissedSignals: true } });
    const stale = existing.map((row) => row.userId).filter((id) => !signals.has(id));
    // "Va bene così" vale finché non arriva un segnale nuovo: allora l'account torna in "Cosa fare" e l'avviso riparte.
    const reopened = new Set(
      existing.filter((row) => row.dismissedAt && hasNewSignals(signals.get(row.userId) ?? [], (row.dismissedSignals as string[] | null) ?? [])).map((row) => row.userId),
    );
    await this.prisma.$transaction([
      this.prisma.suspiciousAccount.deleteMany({ where: { userId: { in: stale } } }),
      // Un account che non è più sospetto lascia la coda: anche il suo "Prendo io".
      this.prisma.adminCaseClaim.deleteMany({ where: { caseKey: { in: stale.map(claimKey) } } }),
      ...[...signals.entries()].map(([userId, list]) =>
        this.prisma.suspiciousAccount.upsert({
          where: { userId },
          create: { userId, signals: list, checkedAt: now, firstSeenAt: now },
          update: reopened.has(userId)
            ? { signals: list, checkedAt: now, dismissedAt: null, dismissedById: null, dismissedNote: null, dismissedSignals: Prisma.DbNull, notifiedAt: null }
            : { signals: list, checkedAt: now },
        }),
      ),
      this.prisma.suspiciousAccountsCheck.upsert({ where: { id: CHECK_ID }, create: { id: CHECK_ID, checkedAt: now }, update: { checkedAt: now } }),
    ]);

    let notified = 0;
    if (options.notify) {
      const pending = await this.prisma.suspiciousAccount.findMany({ where: { notifiedAt: null, dismissedAt: null }, select: { userId: true, signals: true } });
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
      this.prisma.suspiciousAccount.findMany({ select: { userId: true, signals: true, firstSeenAt: true, dismissedAt: true, dismissedById: true, dismissedNote: true } }),
      this.prisma.suspiciousAccountsCheck.findUnique({ where: { id: CHECK_ID } }),
    ]);
    // Un account chiuso o segnato di prova dopo il controllo non si mostra più.
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) }, deletedAt: null, testAccountAt: null },
      select: { id: true, role: true, name: true, surname: true, email: true, professionalProfile: { select: { businessName: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const dismissers = await this.adminNames(rows.flatMap((row) => (row.dismissedById ? [row.dismissedById] : [])));
    const list = rows.flatMap((row) => {
      const user = byId.get(row.userId);
      if (!user) return [];
      const signals = row.signals as AdminUserSignal[];
      const role = user.role as AdminSignalRole;
      const dismissed = row.dismissedAt ? { at: row.dismissedAt.toISOString(), by: dismissers.get(row.dismissedById ?? "") ?? "Admin", note: row.dismissedNote ?? "" } : null;
      return [{ id: user.id, label: personLabel(user), role, signals, advice: adviseSuspiciousUser(role, signals), firstSeenAt: row.firstSeenAt.toISOString(), dismissed }];
    });
    return { checkedAt: last?.checkedAt.toISOString() ?? null, users: sortSuspiciousUsers(list) };
  }

  private async adminNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const admins = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, surname: true, email: true } });
    return new Map(admins.map((a) => [a.id, [a.name, a.surname].filter(Boolean).join(" ") || a.email || "Admin"]));
  }

  /** Stato di "Va bene così" per la scheda della persona. */
  async dismissalOf(userId: string): Promise<{ at: string; by: string; note: string } | null> {
    const row = await this.prisma.suspiciousAccount.findUnique({ where: { userId }, select: { dismissedAt: true, dismissedById: true, dismissedNote: true } });
    if (!row?.dismissedAt) return null;
    const names = await this.adminNames(row.dismissedById ? [row.dismissedById] : []);
    return { at: row.dismissedAt.toISOString(), by: names.get(row.dismissedById ?? "") ?? "Admin", note: row.dismissedNote ?? "" };
  }

  /**
   * "Va bene così": l'admin ha guardato e non c'è niente da fare (es. marito e
   * moglie con lo stesso telefono). Il motivo è obbligatorio e va nel registro
   * azioni; l'account torna da solo se compare un segnale nuovo.
   */
  async dismiss(adminUserId: string, userId: string, note: string): Promise<void> {
    const text = note.trim();
    if (text.length < 10) throw new BadRequestException("Scrivi perché va bene così (almeno 10 caratteri).");
    const row = await this.prisma.suspiciousAccount.findUnique({ where: { userId }, select: { signals: true } });
    if (!row) throw new NotFoundException("Questo account non ha segnali da controllare.");
    const keys = (row.signals as AdminUserSignal[]).map(signalKey);
    await this.prisma.$transaction([
      this.prisma.suspiciousAccount.update({
        where: { userId },
        data: { dismissedAt: new Date(), dismissedById: adminUserId, dismissedNote: text, dismissedSignals: keys },
      }),
      // Esce dalla coda della Home: il "Prendo io" non resta appeso a un caso chiuso.
      this.prisma.adminCaseClaim.deleteMany({ where: { caseKey: claimKey(userId) } }),
    ]);
    await this.auditLogService.record({ entityType: "User", entityId: userId, fieldName: "suspiciousDismissed", newValue: "DISMISSED", changedByUserId: adminUserId, reason: text });
  }

  /** Toglie il "Va bene così": l'account torna in "Cosa fare". */
  async undismiss(adminUserId: string, userId: string): Promise<void> {
    const result = await this.prisma.suspiciousAccount.updateMany({
      where: { userId, dismissedAt: { not: null } },
      data: { dismissedAt: null, dismissedById: null, dismissedNote: null, dismissedSignals: Prisma.DbNull },
    });
    if (result.count === 0) throw new NotFoundException("Questo account non era segnato \"Va bene così\".");
    await this.auditLogService.record({ entityType: "User", entityId: userId, fieldName: "suspiciousDismissed", newValue: "REOPENED", changedByUserId: adminUserId });
  }
}
