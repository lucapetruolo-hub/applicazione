import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  adminCan,
  adviseSuspiciousUser,
  signalKey,
  sortSuspiciousUsers,
  type AdminRoleValue,
  type AdminSignalRole,
  type AdminSignalArchive,
  type AdminSignalArchiveReason,
  type AdminSuspiciousStatus,
  type AdminSuspiciousUsers,
  type AdminUserSignal,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { loadUserSignals, personLabel } from "./user-signals";
import { planSuspicious } from "./suspicious-archive";
import { ScheduledJob } from "../common/scheduled-job";

const CHECK_ID = "ultimo";
/** Stessa chiave della coda "Da fare" (admin-queue.service.ts). */
const claimKey = (userId: string) => `SUSPICIOUS_ACCOUNT:${userId}`;

function archiveOf(
  row: { archiveReason: string | null; dismissedAt: Date | null; dismissedById: string | null; dismissedNote: string | null },
  names: Map<string, string>,
): AdminSignalArchive | null {
  if (!row.archiveReason) return null;
  return {
    reason: row.archiveReason as AdminSignalArchiveReason,
    at: (row.dismissedAt ?? new Date()).toISOString(),
    by: row.dismissedById ? (names.get(row.dismissedById) ?? "Admin") : null,
    note: row.dismissedNote,
  };
}

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

  /** Ricalcola e salva, con l'archivio (suspicious-archive.ts). Con `notify` avvisa i moderatori dei nuovi casi. */
  async check(options: { notify: boolean }, now: Date = new Date()): Promise<{ accounts: number; notified: number }> {
    const { signals, people } = await loadUserSignals(this.prisma, now);
    const existing = await this.prisma.suspiciousAccount.findMany({
      select: { userId: true, signals: true, archiveReason: true, dismissedAt: true, dismissedSignals: true, lastChangedAt: true },
    });
    const flagged = await this.prisma.user.findMany({
      where: { id: { in: [...signals.keys()] }, OR: [{ suspendedAt: { not: null } }, { professionalProfile: { suspendedAt: { not: null } } }] },
      select: { id: true, suspendedAt: true },
    });
    const measures = new Map(flagged.map((u) => [u.id, u.suspendedAt ? ("SUSPENDED" as const) : ("PROFILE_HIDDEN" as const)]));
    const plans = planSuspicious({
      stored: existing.map((row) => ({
        userId: row.userId,
        signals: row.signals as AdminUserSignal[],
        archiveReason: row.archiveReason as AdminSignalArchiveReason | null,
        archivedAt: row.dismissedAt,
        archivedKeys: (row.dismissedSignals as string[] | null) ?? [],
        lastChangedAt: row.lastChangedAt,
      })),
      signals,
      people,
      measures,
      now,
    });

    const leftQueue = plans.filter((p) => p.action === "ARCHIVE" || p.action === "DELETE").map((p) => claimKey(p.userId));
    await this.prisma.$transaction([
      ...plans.map((plan) => {
        switch (plan.action) {
          case "DELETE":
            return this.prisma.suspiciousAccount.delete({ where: { userId: plan.userId } });
          case "ARCHIVE": {
            const archive = { archiveReason: plan.reason, dismissedAt: now, dismissedById: null, dismissedNote: null, dismissedSignals: plan.keys };
            return this.prisma.suspiciousAccount.upsert({
              where: { userId: plan.userId },
              create: { userId: plan.userId, signals: plan.signals, checkedAt: now, firstSeenAt: now, lastChangedAt: plan.lastChangedAt, ...archive },
              update: { signals: plan.signals, checkedAt: now, lastChangedAt: plan.lastChangedAt, ...archive },
            });
          }
          case "REOPEN":
            // Un segnale nuovo: torna da gestire e l'avviso riparte.
            return this.prisma.suspiciousAccount.update({
              where: { userId: plan.userId },
              data: { signals: plan.signals, checkedAt: now, lastChangedAt: plan.lastChangedAt, archiveReason: null, dismissedAt: null, dismissedById: null, dismissedNote: null, dismissedSignals: Prisma.DbNull, notifiedAt: null },
            });
          default:
            return this.prisma.suspiciousAccount.upsert({
              where: { userId: plan.userId },
              create: { userId: plan.userId, signals: plan.signals, checkedAt: now, firstSeenAt: now, lastChangedAt: plan.lastChangedAt },
              update: { signals: plan.signals, checkedAt: now, lastChangedAt: plan.lastChangedAt },
            });
        }
      }),
      // Un account che lascia la coda (archiviato o cancellato) porta via anche il suo "Prendo io".
      this.prisma.adminCaseClaim.deleteMany({ where: { caseKey: { in: leftQueue } } }),
      this.prisma.suspiciousAccountsCheck.upsert({ where: { id: CHECK_ID }, create: { id: CHECK_ID, checkedAt: now }, update: { checkedAt: now } }),
    ]);

    let notified = 0;
    if (options.notify) {
      const pending = await this.prisma.suspiciousAccount.findMany({ where: { notifiedAt: null, archiveReason: null }, select: { userId: true, signals: true } });
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

  @ScheduledJob("0 7 * * *", { timeZone: "Europe/Rome" })
  async morningCheck(now: Date = new Date()): Promise<{ accounts: number; notified: number }> {
    return this.check({ notify: true }, now);
  }

  /** Elenco per Persone → Account sospetti, prima i consigli più urgenti, con la scheda di ognuno. */
  async list(): Promise<AdminSuspiciousUsers> {
    const [rows, last] = await Promise.all([
      this.prisma.suspiciousAccount.findMany({
        select: { userId: true, signals: true, firstSeenAt: true, archiveReason: true, dismissedAt: true, dismissedById: true, dismissedNote: true },
      }),
      this.prisma.suspiciousAccountsCheck.findUnique({ where: { id: CHECK_ID } }),
    ]);
    // Un account chiuso o segnato di prova dopo il controllo non si mostra più.
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) }, deletedAt: null, testAccountAt: null },
      select: { id: true, role: true, name: true, surname: true, email: true, suspendedAt: true, professionalProfile: { select: { businessName: true, suspendedAt: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const names = await this.adminNames(rows.flatMap((row) => (row.dismissedById ? [row.dismissedById] : [])));
    const list = rows.flatMap((row) => {
      const user = byId.get(row.userId);
      if (!user) return [];
      const signals = row.signals as AdminUserSignal[];
      const role = user.role as AdminSignalRole;
      const advice = adviseSuspiciousUser(role, signals);
      let archived = archiveOf(row, names);
      // Una misura presa dopo il controllo del mattino conta subito, senza aspettare domani.
      if (!archived && (user.suspendedAt || user.professionalProfile?.suspendedAt)) {
        archived = { reason: user.suspendedAt ? "SUSPENDED" : "PROFILE_HIDDEN", at: (user.suspendedAt ?? user.professionalProfile?.suspendedAt ?? new Date()).toISOString(), by: null, note: null };
      }
      const status: AdminSuspiciousStatus = archived ? "ARCHIVED" : advice.level === "BASSA" ? "NO_ACTION" : "TODO";
      return [{ id: user.id, label: personLabel(user), role, signals, advice, firstSeenAt: row.firstSeenAt.toISOString(), status, archived }];
    });
    return { checkedAt: last?.checkedAt.toISOString() ?? null, users: sortSuspiciousUsers(list) };
  }

  private async adminNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const admins = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, surname: true, email: true } });
    return new Map(admins.map((a) => [a.id, [a.name, a.surname].filter(Boolean).join(" ") || a.email || "Admin"]));
  }

  /** Archivio per la scheda della persona. */
  async archiveOfUser(userId: string): Promise<AdminSignalArchive | null> {
    const row = await this.prisma.suspiciousAccount.findUnique({ where: { userId }, select: { archiveReason: true, dismissedAt: true, dismissedById: true, dismissedNote: true } });
    if (!row) return null;
    return archiveOf(row, await this.adminNames(row.dismissedById ? [row.dismissedById] : []));
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
        data: { archiveReason: "OK", dismissedAt: new Date(), dismissedById: adminUserId, dismissedNote: text, dismissedSignals: keys },
      }),
      // Esce dalla coda della Home: il "Prendo io" non resta appeso a un caso chiuso.
      this.prisma.adminCaseClaim.deleteMany({ where: { caseKey: claimKey(userId) } }),
    ]);
    await this.auditLogService.record({ entityType: "User", entityId: userId, fieldName: "suspiciousDismissed", newValue: "DISMISSED", changedByUserId: adminUserId, reason: text });
  }

  /** Toglie il "Va bene così": l'account torna in "Cosa fare". */
  async undismiss(adminUserId: string, userId: string): Promise<void> {
    const result = await this.prisma.suspiciousAccount.updateMany({
      where: { userId, archiveReason: { not: null } },
      data: { archiveReason: null, dismissedAt: null, dismissedById: null, dismissedNote: null, dismissedSignals: Prisma.DbNull, lastChangedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Questo account non è in archivio.");
    await this.auditLogService.record({ entityType: "User", entityId: userId, fieldName: "suspiciousDismissed", newValue: "REOPENED", changedByUserId: adminUserId });
  }
}
