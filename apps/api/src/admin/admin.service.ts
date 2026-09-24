import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ContentReportTargetType, ModerationAction, Prisma, PrismaClient } from "@professionisti/database";
import { MODERATION_ACTIONS_BY_TARGET, normalizeAdminRoles, type AdminRoleValue, type ResolveContentReportInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { AuditLogService } from "../audit-log/audit-log.service";

export type AdminUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  role: string;
  adminRoles: string[];
  businessName: string | null;
  professionalProfileId: string | null;
  profileSuspended: boolean;
  createdAt: string;
  deletedAt: string | null;
  suspendedAt: string | null;
};

export type AdminUsersPage = { total: number; page: number; pageSize: number; rows: AdminUserRow[] };

export type AdminOverview = {
  openReports: number;
  pendingAppeals: number;
  openMessages: number;
  pendingRefunds: number;
  openDisputes: number;
  newUsers7d: number;
  clients: number;
  professionals: number;
  suspendedUsers: number;
  hiddenLeads: number;
  waitlist: number;
};

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Utenti con ricerca, filtri e paginazione (docs/CHANGELOG.md §144): prima
   * arrivavano tutti insieme, senza id, ricerca né stato (un account
   * eliminato sembrava attivo). Ricerca su email, nome, cognome e nome
   * attività, senza distinzione tra maiuscole e minuscole.
   */
  async listUsers(params: { q?: string; role?: string; status?: string; page?: number }): Promise<AdminUsersPage> {
    const pageSize = 50;
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const where = this.buildUserWhere(params);
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: USER_ROW_SELECT,
      }),
    ]);
    return { total, page, pageSize, rows: users.map(toUserRow) };
  }

  private buildUserWhere(params: { q?: string; role?: string; status?: string }): Prisma.UserWhereInput {
    const q = params.q?.trim();
    return {
      ...(params.role === "CLIENT" || params.role === "PROFESSIONAL" || params.role === "ADMIN" ? { role: params.role } : {}),
      ...(params.status === "active" ? { deletedAt: null, suspendedAt: null } : {}),
      ...(params.status === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(params.status === "deleted" ? { deletedAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { surname: { contains: q, mode: "insensitive" } },
              { professionalProfile: { businessName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
  }

  /** Tutti gli utenti con gli stessi filtri della tabella, in CSV (docs/CHANGELOG.md §145). */
  async exportUsersCsv(params: { q?: string; role?: string; status?: string }): Promise<string> {
    const users = await this.prisma.user.findMany({ where: this.buildUserWhere(params), orderBy: { createdAt: "desc" }, select: USER_ROW_SELECT });
    const rows = users.map(toUserRow).map((u) => [
      u.email ?? "",
      u.name ?? "",
      u.surname ?? "",
      u.role,
      u.adminRoles.join("+"),
      u.businessName ?? "",
      u.deletedAt ? "eliminato" : u.suspendedAt ? "sospeso" : u.profileSuspended ? "profilo nascosto" : "attivo",
      u.createdAt.slice(0, 10),
    ]);
    return toCsv(["email", "nome", "cognome", "ruolo", "ruolo_admin", "attivita", "stato", "iscritto_il"], rows);
  }

  async exportWaitlistCsv(): Promise<string> {
    const signups = await this.prisma.waitlistSignup.findMany({ orderBy: { createdAt: "desc" } });
    return toCsv(["email", "iscritto_il"], signups.map((w) => [w.email, w.createdAt.toISOString().slice(0, 10)]));
  }

  /**
   * Scheda utente (docs/CHANGELOG.md §145): tutto quello che serve per
   * decidere su una persona senza aprire il database — stato, attività,
   * segnalazioni fatte e ricevute, e la cronologia unificata.
   */
  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { professionalProfile: { include: { category: true } } },
    });
    if (!user) throw new NotFoundException("Utente non trovato.");
    const profileId = user.professionalProfile?.id ?? null;

    const [requests, clientBookings, proBookings, reviewsWritten, reviewsReceived, reportsMade, reportsReceived, profileReports, audit] = await Promise.all([
      this.prisma.guidedRequest.findMany({
        where: { clientId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, description: true, city: true, status: true, hiddenAt: true, createdAt: true, category: { select: { label: true } } },
      }),
      this.prisma.booking.findMany({
        where: { clientId: userId },
        orderBy: { scheduledAt: "desc" },
        take: 50,
        select: { id: true, status: true, scheduledAt: true, professionalProfile: { select: { businessName: true } } },
      }),
      profileId
        ? this.prisma.booking.findMany({
            where: { professionalProfileId: profileId },
            orderBy: { scheduledAt: "desc" },
            take: 50,
            select: { id: true, status: true, scheduledAt: true, client: { select: { name: true, surname: true } } },
          })
        : Promise.resolve([]),
      this.prisma.review.findMany({
        where: { booking: { clientId: userId } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, rating: true, comment: true, hiddenAt: true, createdAt: true, booking: { select: { professionalProfile: { select: { businessName: true } } } } },
      }),
      profileId
        ? this.prisma.review.findMany({
            where: { booking: { professionalProfileId: profileId } },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { id: true, rating: true, comment: true, hiddenAt: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.contentReport.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.contentReport.findMany({ where: { contentOwnerId: userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      profileId
        ? this.prisma.contentReport.findMany({ where: { targetType: "PROFESSIONAL_PROFILE", targetId: profileId }, orderBy: { createdAt: "desc" }, take: 50 })
        : Promise.resolve([]),
      this.prisma.auditLog.findMany({ where: { entityType: "User", entityId: userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);

    // Segnalazioni che riguardano questa persona: decise su un suo contenuto
    // oppure, ancora aperte, sul suo profilo.
    const receivedById = new Map([...reportsReceived, ...profileReports].map((r) => [r.id, r]));
    const received = [...receivedById.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const adminIds = [...new Set(audit.map((a) => a.changedByUserId).filter((id): id is string => Boolean(id)))];
    const adminEmails = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })).map((a) => [a.id, a.email]),
    );

    const reportRow = (r: (typeof reportsMade)[number]) => ({
      id: r.id,
      targetType: r.targetType,
      reason: r.reason,
      status: r.status,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      revertedAt: r.revertedAt?.toISOString() ?? null,
    });

    type TimelineItem = { at: string; kind: string; text: string };
    const timeline: TimelineItem[] = [
      { at: user.createdAt.toISOString(), kind: "account", text: "Iscrizione" },
      ...(user.deletedAt ? [{ at: user.deletedAt.toISOString(), kind: "account", text: "Account eliminato dall'utente" }] : []),
      ...requests.map((r) => ({ at: r.createdAt.toISOString(), kind: "request", text: `Richiesta ${r.category.label}${r.city ? ` a ${r.city}` : ""}` })),
      ...clientBookings.map((b) => ({ at: b.scheduledAt.toISOString(), kind: "booking", text: `Intervento con ${b.professionalProfile.businessName} (${b.status})` })),
      ...proBookings.map((b) => ({
        at: b.scheduledAt.toISOString(),
        kind: "booking",
        text: `Intervento per ${[b.client.name, b.client.surname].filter(Boolean).join(" ") || "cliente"} (${b.status})`,
      })),
      ...reviewsWritten.map((r) => ({ at: r.createdAt.toISOString(), kind: "review", text: `Recensione ${r.rating}★ a ${r.booking.professionalProfile.businessName}` })),
      ...reviewsReceived.map((r) => ({ at: r.createdAt.toISOString(), kind: "review", text: `Recensione ricevuta ${r.rating}★` })),
      ...reportsMade.map((r) => ({ at: r.createdAt.toISOString(), kind: "report", text: `Ha segnalato: ${r.reason}` })),
      ...received.map((r) => ({
        at: r.createdAt.toISOString(),
        kind: "report",
        text: `Segnalato: ${r.reason}${r.action ? ` → ${ACTION_SHORT_LABEL[r.action] ?? r.action}` : ""}`,
      })),
      ...audit.map((a) => ({
        at: a.createdAt.toISOString(),
        kind: "admin",
        text: `${auditLabel(a.fieldName, a.newValue)}${a.reason ? `: ${a.reason}` : ""}${a.changedByUserId ? ` (${adminEmails.get(a.changedByUserId) ?? "admin"})` : ""}`,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      phone: user.phone,
      role: user.role,
      adminRoles: user.role === "ADMIN" ? normalizeAdminRoles(user.adminRoles) : [],
      createdAt: user.createdAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      suspensionNote: user.suspensionNote,
      professionalProfile: user.professionalProfile
        ? {
            id: user.professionalProfile.id,
            businessName: user.professionalProfile.businessName,
            categoryLabel: user.professionalProfile.category.label,
            city: user.professionalProfile.city,
            suspendedAt: user.professionalProfile.suspendedAt?.toISOString() ?? null,
          }
        : null,
      counts: {
        requests: requests.length,
        bookings: clientBookings.length + proBookings.length,
        reviewsWritten: reviewsWritten.length,
        reviewsReceived: reviewsReceived.length,
        reportsMade: reportsMade.length,
        reportsReceived: received.length,
      },
      reportsMade: reportsMade.map(reportRow),
      reportsReceived: received.map(reportRow),
      timeline: timeline.slice(0, 100),
    };
  }

  /**
   * Sospende un account dalla scheda utente, senza una segnalazione (decisione
   * esplicita dell'utente, docs/CHANGELOG.md §145): per un caso arrivato via
   * email o telefono. Motivazione obbligatoria, comunicata all'utente
   * (notifica + email) e registrata nel registro delle azioni admin.
   */
  async suspendUser(adminUserId: string, userId: string, note: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, suspendedAt: true } });
    if (!target) throw new NotFoundException("Utente non trovato.");
    if (target.id === adminUserId) throw new BadRequestException("Non puoi sospendere il tuo stesso account.");
    if (target.role === "ADMIN") throw new BadRequestException("Togli prima il ruolo di amministratore a questo account.");
    if (target.suspendedAt) throw new BadRequestException("L'account è già sospeso.");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: now, suspensionNote: note.trim() } }),
      this.prisma.professionalProfile.updateMany({ where: { userId, suspendedAt: null }, data: { suspendedAt: now } }),
    ]);
    await this.auditLogService.record({ entityType: "User", entityId: userId, fieldName: "suspendedAt", newValue: "SUSPENDED", changedByUserId: adminUserId, reason: note.trim() });
    await this.notificationsService.notify(userId, "ACCOUNT_SUSPENDED", { note: note.trim() });
    return { id: userId, suspendedAt: now.toISOString() };
  }

  async reactivateUser(adminUserId: string, userId: string, note: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, suspendedAt: true } });
    if (!target) throw new NotFoundException("Utente non trovato.");
    if (!target.suspendedAt) throw new BadRequestException("L'account non è sospeso.");
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: null, suspensionNote: null } }),
      this.prisma.professionalProfile.updateMany({ where: { userId }, data: { suspendedAt: null } }),
    ]);
    await this.auditLogService.record({ entityType: "User", entityId: userId, fieldName: "suspendedAt", oldValue: "SUSPENDED", newValue: "ACTIVE", changedByUserId: adminUserId, reason: note.trim() });
    await this.notificationsService.notify(userId, "ACCOUNT_REACTIVATED", { note: note.trim() });
    return { id: userId, suspendedAt: null };
  }

  /**
   * Assegna o toglie i ruoli di amministratore (solo super admin,
   * docs/CHANGELOG.md §145-§146). I ruoli si combinano (es. Moderatore +
   * Finanza); lista vuota = non più admin: torna professionista se ha un
   * profilo, altrimenti cliente. Mai togliere l'ultimo super admin né
   * cambiare i propri ruoli (niente blocchi fuori dal pannello).
   */
  async setAdminRoles(adminUserId: string, userId: string, roles: AdminRoleValue[]) {
    if (userId === adminUserId) throw new BadRequestException("Non puoi cambiare il tuo stesso ruolo.");
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, adminRoles: true, deletedAt: true, professionalProfile: { select: { id: true } } },
    });
    if (!target || target.deletedAt) throw new NotFoundException("Utente non trovato.");
    const nextRoles = roles.length === 0 ? [] : normalizeAdminRoles(roles);
    const wasSuper = target.role === "ADMIN" && normalizeAdminRoles(target.adminRoles).includes("SUPER");
    if (wasSuper && !nextRoles.includes("SUPER")) {
      const supers = await this.prisma.user.count({
        where: { role: "ADMIN", OR: [{ adminRoles: { has: "SUPER" } }, { adminRoles: { isEmpty: true } }] },
      });
      if (supers <= 1) throw new BadRequestException("Serve almeno un super admin.");
    }
    const oldValue = target.role === "ADMIN" ? normalizeAdminRoles(target.adminRoles).join("+") : target.role;
    const data =
      nextRoles.length === 0
        ? { role: target.professionalProfile ? ("PROFESSIONAL" as const) : ("CLIENT" as const), adminRoles: [] as AdminRoleValue[] }
        : { role: "ADMIN" as const, adminRoles: nextRoles };
    await this.prisma.user.update({ where: { id: userId }, data });
    await this.auditLogService.record({
      entityType: "User",
      entityId: userId,
      fieldName: "adminRoles",
      oldValue,
      newValue: nextRoles.length ? nextRoles.join("+") : data.role,
      changedByUserId: adminUserId,
    });
    return { id: userId, role: data.role, adminRoles: data.adminRoles };
  }

  /** Registro delle azioni admin (docs/CHANGELOG.md §145): chi ha fatto cosa e quando. */
  async listAuditLog(params: { page?: number; entityType?: string }) {
    const pageSize = 50;
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const where: Prisma.AuditLogWhereInput = params.entityType ? { entityType: params.entityType } : {};
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const userIds = [...new Set(rows.flatMap((r) => [r.changedByUserId, r.entityType === "User" ? r.entityId : null]).filter((id): id is string => Boolean(id)))];
    const users = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]),
    );
    return {
      total,
      page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        entityType: r.entityType,
        entityId: r.entityId,
        entityLabel: r.entityType === "User" ? (users.get(r.entityId) ?? null) : null,
        fieldName: r.fieldName,
        oldValue: r.oldValue,
        newValue: r.newValue,
        label: auditLabel(r.fieldName, r.newValue),
        reason: r.reason,
        changedByEmail: r.changedByUserId ? (users.get(r.changedByUserId) ?? null) : null,
      })),
    };
  }

  /** Ricerca globale del pannello (⌘K, docs/CHANGELOG.md §145): utenti e segnalazioni. */
  async search(q: string) {
    const query = q.trim();
    if (query.length < 2) return { users: [], reports: [] };
    const [users, reports] = await Promise.all([
      this.prisma.user.findMany({
        where: this.buildUserWhere({ q: query }),
        orderBy: { createdAt: "desc" },
        take: 8,
        select: USER_ROW_SELECT,
      }),
      this.prisma.contentReport.findMany({
        where: { OR: [{ reason: { contains: query, mode: "insensitive" } }, { details: { contains: query, mode: "insensitive" } }] },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, reason: true, targetType: true, status: true, createdAt: true },
      }),
    ]);
    return {
      users: users.map(toUserRow),
      reports: reports.map((r) => ({ id: r.id, reason: r.reason, targetType: r.targetType, status: r.status, createdAt: r.createdAt.toISOString() })),
    };
  }

  /**
   * Andamento settimanale delle ultime 12 settimane (docs/CHANGELOG.md
   * §145): nuovi clienti e professionisti, richieste, interventi prenotati,
   * segnalazioni. Una query per serie, raggruppata in memoria (volumi di
   * lancio, CLAUDE.md §7).
   */
  async getTrends(): Promise<AdminTrends> {
    const weeks = 12;
    const start = startOfIsoWeek(new Date());
    start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7);
    const [users, requests, bookings, reports] = await Promise.all([
      this.prisma.user.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, role: true } }),
      this.prisma.guidedRequest.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.booking.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.contentReport.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    ]);
    const bucket = (dates: Date[]) => {
      const counts = new Array<number>(weeks).fill(0);
      for (const d of dates) {
        const index = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (index >= 0 && index < weeks) counts[index]! += 1;
      }
      return counts;
    };
    const weekStarts = Array.from({ length: weeks }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i * 7);
      return d.toISOString().slice(0, 10);
    });
    return {
      weekStarts,
      series: {
        newClients: bucket(users.filter((u) => u.role === "CLIENT").map((u) => u.createdAt)),
        newProfessionals: bucket(users.filter((u) => u.role === "PROFESSIONAL").map((u) => u.createdAt)),
        requests: bucket(requests.map((r) => r.createdAt)),
        bookings: bucket(bookings.map((b) => b.createdAt)),
        reports: bucket(reports.map((r) => r.createdAt)),
      },
    };
  }

  /**
   * Contenuto segnalato per intero, visibile all'admin anche se nascosto o
   * sospeso (docs/CHANGELOG.md §145): prima "Apri contenuto" portava a una
   * pagina "non trovato" dopo la misura, e non si poteva ricontrollare cosa
   * era stato tolto prima di decidere su una contestazione.
   */
  async getReportTarget(reportId: string): Promise<AdminReportTarget> {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("Segnalazione non trovata.");
    const { targetType, targetId } = report;
    if (targetType === "PROFESSIONAL_PROFILE") {
      const p = await this.prisma.professionalProfile.findUnique({ where: { id: targetId }, include: { category: true, user: { select: { email: true } } } });
      if (!p) return { exists: false };
      return {
        exists: true,
        title: `${p.businessName} · ${p.category.label} · ${p.city}`,
        author: p.user.email,
        text: p.bio,
        photos: [...(p.imageUrl ? [p.imageUrl] : []), ...p.portfolioUrls],
        rating: null,
        state: p.deletedAt ? "Eliminato dall'utente" : p.suspendedAt ? "Tolto da ricerca e pagina pubblica" : "Visibile",
        ownerUserId: p.userId,
      };
    }
    if (targetType === "REVIEW") {
      const r = await this.prisma.review.findUnique({
        where: { id: targetId },
        include: { booking: { include: { client: { select: { id: true, email: true } }, professionalProfile: { select: { businessName: true } } } } },
      });
      if (!r) return { exists: false };
      return {
        exists: true,
        title: `Recensione su ${r.booking.professionalProfile.businessName}`,
        author: r.booking.client.email,
        text: r.comment,
        photos: r.photoUrls,
        rating: r.rating,
        state: r.hiddenAt ? "Nascosta" : "Visibile",
        ownerUserId: r.booking.client.id,
      };
    }
    if (targetType === "CLIENT_REVIEW") {
      const r = await this.prisma.clientReview.findUnique({
        where: { id: targetId },
        include: { client: { select: { name: true, surname: true } }, booking: { include: { professionalProfile: { select: { businessName: true, userId: true, user: { select: { email: true } } } } } } },
      });
      if (!r) return { exists: false };
      return {
        exists: true,
        title: `Recensione su ${[r.client.name, r.client.surname].filter(Boolean).join(" ") || "cliente"}`,
        author: r.booking.professionalProfile.user.email,
        text: r.comment,
        photos: r.mediaUrls,
        rating: r.rating,
        state: r.hiddenAt ? "Nascosta" : "Visibile",
        ownerUserId: r.booking.professionalProfile.userId,
      };
    }
    const g = await this.prisma.guidedRequest.findUnique({ where: { id: targetId }, include: { category: true, client: { select: { id: true, email: true } } } });
    if (!g) return { exists: false };
    return {
      exists: true,
      title: `Richiesta ${g.category.label}${g.city ? ` a ${g.city}` : ""}`,
      author: g.client.email,
      text: g.description,
      photos: g.photoUrls,
      rating: null,
      state: g.hiddenAt ? "Chiusa e nascosta" : g.status === "CLOSED" ? "Chiusa" : "Aperta",
      ownerUserId: g.client.id,
    };
  }

  /**
   * Contatori della home admin (docs/CHANGELOG.md §144): cosa c'è da fare
   * oggi, come la Home di Shopify o l'Overview di Vercel.
   */
  async getOverview(): Promise<AdminOverview> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [openReports, pendingAppeals, openMessages, pendingRefunds, openDisputes, newUsers7d, clients, professionals, suspendedUsers, hiddenLeads, waitlist] =
      await Promise.all([
        this.prisma.contentReport.count({ where: { status: "OPEN" } }),
        this.prisma.contentReport.count({ where: { appealedAt: { not: null }, appealRejectedAt: null, revertedAt: null } }),
        this.prisma.contactMessage.count({ where: { resolved: false } }),
        this.prisma.refund.count({ where: { status: "REQUESTED" } }),
        this.prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
        this.prisma.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
        this.prisma.user.count({ where: { role: "CLIENT", deletedAt: null } }),
        this.prisma.user.count({ where: { role: "PROFESSIONAL", deletedAt: null } }),
        this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
        this.prisma.lead.count({ where: { hiddenByProfessionalAt: { not: null } } }),
        this.prisma.waitlistSignup.count(),
      ]);
    return { openReports, pendingAppeals, openMessages, pendingRefunds, openDisputes, newUsers7d, clients, professionals, suspendedUsers, hiddenLeads, waitlist };
  }

  /**
   * Email raccolte dal riquadro "Arriviamo presto nella tua zona"
   * (homepage, sotto la soglia di professionisti reali per mostrare la
   * vetrina — CLAUDE.md §10 Fase 4) — richiesta esplicita dell'utente:
   * "salvale in un elenco visualizzabile dai profili admin". Erano già
   * scritte su `WaitlistSignup` da `WaitlistService.signup`, mai lette da
   * nessun endpoint prima d'ora.
   */
  async listWaitlist(): Promise<{ email: string; createdAt: string }[]> {
    const signups = await this.prisma.waitlistSignup.findMany({ orderBy: { createdAt: "desc" } });
    return signups.map((s) => ({ email: s.email, createdAt: s.createdAt.toISOString() }));
  }

  async promoteToAdmin(email: string): Promise<{ email: string; role: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException("Nessun utente registrato con questa email.");
    }
    const updated = await this.prisma.user.update({ where: { email }, data: { role: "ADMIN", adminRoles: ["SUPER"] } });
    return { email: updated.email as string, role: updated.role };
  }

  /**
   * Segnalazioni contenuti (richiesta esplicita dell'utente, "Verbale di
   * Conformità" — DSA art. 16): elenco per gestione admin, con un'etichetta
   * leggibile del target (nome attività o autore della recensione) invece
   * del solo id, così l'admin non deve andare a cercarlo a mano prima di
   * poter decidere. `targetLabel` è "best effort": `null` se il contenuto
   * segnalato è nel frattempo sparito (es. account eliminato).
   */
  async listContentReports(status?: "OPEN" | "RESOLVED" | "DISMISSED") {
    const reports = await this.prisma.contentReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { reporter: { select: { email: true, name: true, surname: true } } },
    });

    // `linkedProfessionalProfileId` alimenta il bottone "Vai alla
    // segnalazione" lato admin (richiesta esplicita dell'utente): per un
    // profilo segnalato è il target stesso, per una recensione è il
    // profilo su cui vive (serve a costruire il link pubblico
    // `/professionista/{id}#recensione-{reviewId}`) — per una recensione
    // sul cliente resta `null` di proposito: quel contenuto non ha una
    // pagina pubblica raggiungibile (nessun profilo pubblico del
    // cliente in questo marketplace, CLAUDE.md §40/§45), un link lì
    // sarebbe stato un bottone che non porta da nessuna parte.
    const targetInfo = await Promise.all(
      reports.map(async (report): Promise<{ label: string | null; linkedProfessionalProfileId: string | null; excerpt?: string | null }> => {
        if (report.targetType === "PROFESSIONAL_PROFILE") {
          const profile = await this.prisma.professionalProfile.findUnique({
            where: { id: report.targetId },
            select: { businessName: true, bio: true },
          });
          return { label: profile?.businessName ?? null, linkedProfessionalProfileId: profile ? report.targetId : null, excerpt: profile?.bio ?? null };
        }
        if (report.targetType === "REVIEW") {
          const review = await this.prisma.review.findUnique({
            where: { id: report.targetId },
            select: { comment: true, booking: { select: { professionalProfile: { select: { id: true, businessName: true } } } } },
          });
          return {
            label: review ? `Recensione su ${review.booking.professionalProfile.businessName}` : null,
            linkedProfessionalProfileId: review?.booking.professionalProfile.id ?? null,
            excerpt: review?.comment ?? null,
          };
        }
        if (report.targetType === "GUIDED_REQUEST") {
          const request = await this.prisma.guidedRequest.findUnique({
            where: { id: report.targetId },
            select: { city: true, description: true, category: { select: { label: true } }, client: { select: { name: true, surname: true } } },
          });
          const clientName = request ? [request.client.name, request.client.surname].filter(Boolean).join(" ") || "cliente" : null;
          return {
            label: request ? `Richiesta ${request.category.label}${request.city ? ` a ${request.city}` : ""} di ${clientName}` : null,
            linkedProfessionalProfileId: null,
            excerpt: request?.description ?? null,
          };
        }
        const clientReview = await this.prisma.clientReview.findUnique({
          where: { id: report.targetId },
          select: { comment: true, client: { select: { name: true, surname: true } } },
        });
        return {
          label: clientReview ? `Recensione su ${[clientReview.client.name, clientReview.client.surname].filter(Boolean).join(" ") || "cliente"}` : null,
          linkedProfessionalProfileId: null,
          excerpt: clientReview?.comment ?? null,
        };
      }),
    );

    return reports.map((report, index) => ({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      targetLabel: targetInfo[index]?.label ?? null,
      linkedProfessionalProfileId: targetInfo[index]?.linkedProfessionalProfileId ?? null,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      resolutionNote: report.resolutionNote,
      targetExcerpt: targetInfo[index]?.excerpt ?? null,
      action: report.action,
      authoritiesNotifiedAt: report.authoritiesNotifiedAt?.toISOString() ?? null,
      revertedAt: report.revertedAt?.toISOString() ?? null,
      revertNote: report.revertNote,
      appealText: report.appealText,
      appealedAt: report.appealedAt?.toISOString() ?? null,
      appealRejectedAt: report.appealRejectedAt?.toISOString() ?? null,
      appealRejectNote: report.appealRejectNote,
      reporterEmail: report.reporter.email,
      reporterName: [report.reporter.name, report.reporter.surname].filter(Boolean).join(" ") || null,
    }));
  }

  /**
   * Risolve una segnalazione (DSA artt. 16/17, docs/CHANGELOG.md §144).
   * - DISMISSED: nessuna misura, il segnalante viene informato.
   * - RESOLVED: applica davvero la misura scelta (`action`, compatibile col
   *   tipo di contenuto — `MODERATION_ACTIONS_BY_TARGET`), poi manda al
   *   segnalante l'esito e all'autore la motivazione con misura presa e
   *   possibilità di contestare (pagina /segnalazioni).
   * Prima di §144 "Risolvi" cambiava solo lo stato: il contenuto restava
   * online mentre la motivazione descriveva una limitazione mai avvenuta.
   */
  async resolveContentReport(id: string, input: ResolveContentReportInput, adminUserId: string | null = null) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException("Segnalazione non trovata.");
    }
    if (report.status !== "OPEN") {
      throw new BadRequestException("Questa segnalazione è già stata decisa.");
    }
    const note = input.resolutionNote?.trim() || null;
    const status = input.status;
    const action = status === "RESOLVED" ? (input.action ?? null) : null;
    if (status === "RESOLVED" && !note) {
      // Stessa regola già applicata da `resolveContentReportSchema` lato
      // Zod — riverificata qui perché questo metodo non deve mai fidarsi
      // solo della validazione a monte per un vincolo che alimenta un
      // obbligo di trasparenza reale.
      throw new BadRequestException("Indica il motivo della decisione prima di risolvere la segnalazione.");
    }
    if (status === "RESOLVED" && (!action || !MODERATION_ACTIONS_BY_TARGET[report.targetType].includes(action))) {
      throw new BadRequestException("Misura non valida per questo tipo di contenuto.");
    }

    const ownerUserId = await this.resolveContentOwnerUserId(report.targetType, report.targetId);
    if (action && action !== "WARN" && action !== "REQUEST_CORRECTION" && !(await this.targetExists(report.targetType, report.targetId))) {
      throw new BadRequestException("Il contenuto segnalato non esiste più: scegli \"Avvisa l'autore\" oppure ignora la segnalazione.");
    }
    if (action === "SUSPEND_USER" && !ownerUserId) {
      throw new BadRequestException("Impossibile risalire all'autore del contenuto.");
    }

    const now = new Date();
    const affectedProfileIds = await this.prisma.$transaction(async (tx) => {
      const profileIds = action ? await this.applyModeration(tx, report.targetType, report.targetId, action, ownerUserId, now) : [];
      await tx.contentReport.update({
        where: { id },
        data: {
          status,
          resolvedAt: now,
          resolutionNote: note,
          action,
          contentOwnerId: status === "RESOLVED" ? ownerUserId : null,
          authoritiesNotifiedAt: input.authoritiesNotified ? now : null,
        },
      });
      return profileIds;
    });
    await Promise.all(affectedProfileIds.map((profileId) => this.professionalMetricsService.recomputeReviews(profileId)));
    await this.auditLogService.record({
      entityType: "ContentReport",
      entityId: report.id,
      fieldName: "status",
      oldValue: "OPEN",
      newValue: action ? `${status}:${action}` : status,
      changedByUserId: adminUserId,
      reason: note,
    });

    await this.notificationsService.notify(report.reporterId, "CONTENT_REPORT_DECISION", {
      contentReportId: report.id,
      targetType: report.targetType,
      status,
      note,
    });

    if (status === "RESOLVED" && ownerUserId) {
      await this.notificationsService.notify(ownerUserId, "CONTENT_REPORT_UPHELD", {
        contentReportId: report.id,
        targetType: report.targetType,
        action,
        note,
      });
    }

    return { id: report.id, status, action, resolutionNote: note };
  }

  /**
   * "Annulla misura" (ricorso accolto o errore dell'admin, DSA art. 20):
   * toglie la misura applicata, la segnalazione resta in archivio con la
   * motivazione dell'annullamento, l'autore viene avvisato.
   */
  async revertContentReport(id: string, note: string, adminUserId: string | null = null) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Segnalazione non trovata.");
    if (report.status !== "RESOLVED") throw new BadRequestException("Solo una segnalazione accolta ha una misura da annullare.");
    if (report.revertedAt) throw new BadRequestException("La misura è già stata annullata.");

    const now = new Date();
    const affectedProfileIds = await this.prisma.$transaction(async (tx) => {
      const profileIds = report.action ? await this.undoModeration(tx, report.targetType, report.targetId, report.action, report.contentOwnerId) : [];
      await tx.contentReport.update({ where: { id }, data: { revertedAt: now, revertNote: note.trim() } });
      return profileIds;
    });
    await Promise.all(affectedProfileIds.map((profileId) => this.professionalMetricsService.recomputeReviews(profileId)));
    await this.auditLogService.record({
      entityType: "ContentReport",
      entityId: report.id,
      fieldName: "revert",
      oldValue: report.action,
      newValue: "REVERTED",
      changedByUserId: adminUserId,
      reason: note.trim(),
    });

    if (report.contentOwnerId) {
      await this.notificationsService.notify(report.contentOwnerId, "CONTENT_REPORT_REVERTED", {
        contentReportId: report.id,
        targetType: report.targetType,
        note: note.trim(),
      });
    }
    return { id: report.id, revertedAt: now.toISOString() };
  }

  /** Ricorso dell'autore respinto: la misura resta, l'autore riceve la motivazione. */
  async rejectAppeal(id: string, note: string, adminUserId: string | null = null) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Segnalazione non trovata.");
    if (!report.appealedAt || report.appealRejectedAt || report.revertedAt) {
      throw new BadRequestException("Non c'è un ricorso in attesa su questa segnalazione.");
    }
    const now = new Date();
    await this.prisma.contentReport.update({ where: { id }, data: { appealRejectedAt: now, appealRejectNote: note.trim() } });
    await this.auditLogService.record({
      entityType: "ContentReport",
      entityId: report.id,
      fieldName: "appeal",
      newValue: "REJECTED",
      changedByUserId: adminUserId,
      reason: note.trim(),
    });
    if (report.contentOwnerId) {
      await this.notificationsService.notify(report.contentOwnerId, "CONTENT_REPORT_APPEAL_REJECTED", {
        contentReportId: report.id,
        targetType: report.targetType,
        note: note.trim(),
      });
    }
    return { id: report.id, appealRejectedAt: now.toISOString() };
  }

  private async targetExists(targetType: ContentReportTargetType, targetId: string): Promise<boolean> {
    if (targetType === "PROFESSIONAL_PROFILE") return (await this.prisma.professionalProfile.count({ where: { id: targetId } })) > 0;
    if (targetType === "REVIEW") return (await this.prisma.review.count({ where: { id: targetId } })) > 0;
    if (targetType === "CLIENT_REVIEW") return (await this.prisma.clientReview.count({ where: { id: targetId } })) > 0;
    return (await this.prisma.guidedRequest.count({ where: { id: targetId } })) > 0;
  }

  /**
   * Applica la misura. "Sospendi account" include anche la misura più lieve
   * sul contenuto segnalato (recensione/richiesta nascosta, profilo tolto
   * dalla ricerca): sospendere l'autore lasciando online proprio il
   * contenuto segnalato non avrebbe senso. Restituisce i profili la cui
   * media voti va ricalcolata.
   */
  private async applyModeration(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
    action: ModerationAction,
    ownerUserId: string | null,
    now: Date,
  ): Promise<string[]> {
    const hideContent = action === "HIDE_CONTENT" || (action === "SUSPEND_USER" && targetType !== "PROFESSIONAL_PROFILE");
    const profileIds: string[] = [];
    if (hideContent) profileIds.push(...(await this.setContentHidden(tx, targetType, targetId, now)));
    if (action === "SUSPEND_PROFILE" || (action === "SUSPEND_USER" && targetType === "PROFESSIONAL_PROFILE")) {
      await tx.professionalProfile.update({ where: { id: targetId }, data: { suspendedAt: now } });
    }
    if (action === "SUSPEND_USER" && ownerUserId) {
      await tx.user.update({ where: { id: ownerUserId }, data: { suspendedAt: now } });
      // Un professionista sospeso sparisce anche da ricerca e fan-out.
      await tx.professionalProfile.updateMany({ where: { userId: ownerUserId, suspendedAt: null }, data: { suspendedAt: now } });
    }
    return profileIds;
  }

  private async undoModeration(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
    action: ModerationAction,
    ownerUserId: string | null,
  ): Promise<string[]> {
    const contentWasHidden = action === "HIDE_CONTENT" || (action === "SUSPEND_USER" && targetType !== "PROFESSIONAL_PROFILE");
    const profileIds: string[] = [];
    if (contentWasHidden) profileIds.push(...(await this.setContentHidden(tx, targetType, targetId, null)));
    if (action === "SUSPEND_PROFILE" || (action === "SUSPEND_USER" && targetType === "PROFESSIONAL_PROFILE")) {
      await tx.professionalProfile.updateMany({ where: { id: targetId }, data: { suspendedAt: null } });
    }
    if (action === "SUSPEND_USER" && ownerUserId) {
      await tx.user.updateMany({ where: { id: ownerUserId }, data: { suspendedAt: null } });
      await tx.professionalProfile.updateMany({ where: { userId: ownerUserId }, data: { suspendedAt: null } });
    }
    return profileIds;
  }

  /** Nasconde (o ripristina, con `null`) il contenuto; per una richiesta aperta la chiude anche. */
  private async setContentHidden(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
    hiddenAt: Date | null,
  ): Promise<string[]> {
    if (targetType === "REVIEW") {
      const review = await tx.review.update({
        where: { id: targetId },
        data: { hiddenAt },
        select: { booking: { select: { professionalProfileId: true } } },
      });
      return [review.booking.professionalProfileId];
    }
    if (targetType === "CLIENT_REVIEW") {
      await tx.clientReview.update({ where: { id: targetId }, data: { hiddenAt } });
      return [];
    }
    if (targetType === "GUIDED_REQUEST") {
      const request = await tx.guidedRequest.findUnique({ where: { id: targetId }, select: { status: true } });
      // Ripristinarla non la riapre: una richiesta chiusa per moderazione
      // resta chiusa, torna solo visibile ai professionisti che l'avevano.
      const closeIt = hiddenAt !== null && request?.status === "OPEN";
      await tx.guidedRequest.update({ where: { id: targetId }, data: { hiddenAt, ...(closeIt ? { status: "CLOSED" } : {}) } });
    }
    return [];
  }

  /**
   * Chi ha scritto/possiede il contenuto segnalato — il destinatario dello
   * "statement of reasons" quando una segnalazione viene accolta. Stessa
   * distinzione per `targetType` già usata in `listContentReports` per
   * risolvere `targetLabel`: per una `CLIENT_REVIEW` l'autore è il
   * professionista (che l'ha scritta sul cliente), non il cliente stesso.
   */
  private async resolveContentOwnerUserId(targetType: ContentReportTargetType, targetId: string): Promise<string | null> {
    if (targetType === "PROFESSIONAL_PROFILE") {
      const profile = await this.prisma.professionalProfile.findUnique({ where: { id: targetId }, select: { userId: true } });
      return profile?.userId ?? null;
    }
    if (targetType === "REVIEW") {
      const review = await this.prisma.review.findUnique({ where: { id: targetId }, select: { booking: { select: { clientId: true } } } });
      return review?.booking.clientId ?? null;
    }
    if (targetType === "GUIDED_REQUEST") {
      const request = await this.prisma.guidedRequest.findUnique({ where: { id: targetId }, select: { clientId: true } });
      return request?.clientId ?? null;
    }
    const clientReview = await this.prisma.clientReview.findUnique({
      where: { id: targetId },
      select: { booking: { select: { professionalProfile: { select: { userId: true } } } } },
    });
    return clientReview?.booking.professionalProfile.userId ?? null;
  }

  /**
   * Messaggi dal form "Contatti" (footer, richiesta esplicita dell'utente al
   * posto dell'elenco categorie "Servizi") — solo quelli non ancora gestiti,
   * stesso principio già seguito per le segnalazioni contenuti (§ sopra).
   */
  async listContactMessages(resolved = false): Promise<
    { id: string; role: string; email: string; content: string; resolved: boolean; createdAt: string }[]
  > {
    const messages = await this.prisma.contactMessage.findMany({
      // Archivio dei messaggi gestiti (docs/CHANGELOG.md §144): prima un
      // messaggio segnato come gestito spariva del tutto.
      where: { resolved },
      orderBy: { createdAt: "desc" },
    });
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      email: m.email,
      content: m.content,
      resolved: m.resolved,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async resolveContactMessage(id: string): Promise<{ id: string; resolved: boolean }> {
    const message = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!message) {
      throw new NotFoundException("Messaggio non trovato.");
    }
    const updated = await this.prisma.contactMessage.update({ where: { id }, data: { resolved: true } });
    return { id: updated.id, resolved: updated.resolved };
  }

  /**
   * Richieste che un professionista ha "eliminato" dalla propria lista
   * (`ProfessionalsService.deleteLead`, docs/CHANGELOG.md §143): richiesta
   * esplicita dell'utente, "nascondile, in modo che un admin possa vederle".
   * Solo i dati per capire cosa è stato tolto e perché — mai telefono,
   * email o indirizzo del cliente.
   */
  async listHiddenLeads(): Promise<AdminHiddenLeadRow[]> {
    const leads = await this.prisma.lead.findMany({
      where: { hiddenByProfessionalAt: { not: null } },
      orderBy: { hiddenByProfessionalAt: "desc" },
      include: {
        professionalProfile: { select: { id: true, businessName: true } },
        guidedRequest: {
          select: {
            id: true,
            description: true,
            city: true,
            createdAt: true,
            category: { select: { label: true } },
            client: { select: { name: true, surname: true, deletedAt: true } },
            quotes: { select: { professionalProfileId: true, status: true } },
          },
        },
      },
    });
    return leads.map((lead) => {
      const quote = lead.guidedRequest.quotes.find((q) => q.professionalProfileId === lead.professionalProfileId);
      const client = lead.guidedRequest.client;
      return {
        leadId: lead.id,
        guidedRequestId: lead.guidedRequest.id,
        professionalProfileId: lead.professionalProfile.id,
        businessName: lead.professionalProfile.businessName,
        clientName: client.deletedAt ? null : [client.name, client.surname].filter(Boolean).join(" ") || null,
        clientAccountDeleted: client.deletedAt !== null,
        categoryLabel: lead.guidedRequest.category.label,
        city: lead.guidedRequest.city,
        description: lead.guidedRequest.description,
        reason: hiddenLeadReason(lead.status, quote?.status ?? null, client.deletedAt !== null),
        requestCreatedAt: lead.guidedRequest.createdAt.toISOString(),
        hiddenAt: (lead.hiddenByProfessionalAt as Date).toISOString(),
      };
    });
  }
}

export type AdminHiddenLeadRow = {
  leadId: string;
  guidedRequestId: string;
  professionalProfileId: string;
  businessName: string;
  clientName: string | null;
  clientAccountDeleted: boolean;
  categoryLabel: string;
  city: string;
  description: string;
  reason: string;
  requestCreatedAt: string;
  hiddenAt: string;
};

/** Stato della scheda al momento in cui è stata eliminata, in parole. */
function hiddenLeadReason(leadStatus: string, quoteStatus: string | null, clientAccountDeleted: boolean): string {
  if (leadStatus === "EXPIRED") return "Scaduta";
  if (leadStatus === "DECLINED") return "Rifiutata dal professionista";
  if (quoteStatus === "WITHDRAWN") return "Preventivo ritirato";
  if (quoteStatus === "REJECTED") return "Preventivo rifiutato dal cliente";
  if (clientAccountDeleted) return "Account cliente eliminato";
  return "Chiusa";
}

export type AdminTrends = {
  weekStarts: string[];
  series: { newClients: number[]; newProfessionals: number[]; requests: number[]; bookings: number[]; reports: number[] };
};

export type AdminReportTarget =
  | { exists: false }
  | {
      exists: true;
      title: string;
      author: string | null;
      text: string | null;
      photos: string[];
      rating: number | null;
      state: string;
      ownerUserId: string;
    };

const USER_ROW_SELECT = {
  id: true,
  email: true,
  name: true,
  surname: true,
  role: true,
  adminRoles: true,
  createdAt: true,
  deletedAt: true,
  suspendedAt: true,
  professionalProfile: { select: { id: true, businessName: true, suspendedAt: true } },
} satisfies Prisma.UserSelect;

function toUserRow(u: Prisma.UserGetPayload<{ select: typeof USER_ROW_SELECT }>): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    surname: u.surname,
    role: u.role,
    adminRoles: u.role === "ADMIN" ? normalizeAdminRoles(u.adminRoles) : [],
    businessName: u.professionalProfile?.businessName ?? null,
    professionalProfileId: u.professionalProfile?.id ?? null,
    profileSuspended: u.professionalProfile?.suspendedAt != null,
    createdAt: u.createdAt.toISOString(),
    deletedAt: u.deletedAt?.toISOString() ?? null,
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
  };
}

/** CSV con separatore ";" (Excel in italiano) e BOM per gli accenti. */
function toCsv(header: string[], rows: string[][]): string {
  const cell = (value: string) => (/[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d;
}

const ACTION_SHORT_LABEL: Record<string, string> = {
  WARN: "avvertimento",
  REQUEST_CORRECTION: "richiesta di correzione",
  HIDE_CONTENT: "contenuto nascosto",
  SUSPEND_PROFILE: "profilo tolto dalla ricerca",
  SUSPEND_USER: "account sospeso",
};
const ROLE_SHORT_LABEL: Record<string, string> = {
  SUPER: "super admin",
  MODERATOR: "moderatore",
  FINANCE: "finanza",
  CLIENT: "cliente (non più admin)",
  PROFESSIONAL: "professionista (non più admin)",
};

/** Frase leggibile per una riga del registro. */
function auditLabel(fieldName: string | null, newValue: string | null): string {
  if (fieldName === "suspendedAt") return newValue === "SUSPENDED" ? "Account sospeso" : "Account riattivato";
  if (fieldName === "adminRole" || fieldName === "adminRoles") {
    const labels = (newValue ?? "").replace(/"/g, "").replace(/[[\]]/g, "").split(/[+,]/).filter(Boolean).map((v) => ROLE_SHORT_LABEL[v] ?? v);
    return `Ruolo cambiato in ${labels.join(" + ") || "—"}`;
  }
  if (fieldName === "revert") return "Misura annullata";
  if (fieldName === "appeal") return "Contestazione respinta";
  if (fieldName === "status" && newValue?.startsWith("RESOLVED")) {
    const action = newValue.split(":")[1] ?? "";
    return `Segnalazione accolta: ${ACTION_SHORT_LABEL[action] ?? action}`;
  }
  if (fieldName === "status" && newValue === "DISMISSED") return "Segnalazione non accolta";
  return [fieldName, newValue].filter(Boolean).join(" → ") || "Modifica";
}
