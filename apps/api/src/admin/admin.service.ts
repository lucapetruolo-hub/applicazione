import { ACTION_SHORT_LABEL, auditLabel } from "./audit-label";
import { AdminSecurityAlertsService } from "./admin-security-alerts.service";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ContentReportTargetType, ModerationAction, Prisma, PrismaClient } from "@professionisti/database";
import { CLIENT_DELETED_REQUEST_RETENTION_DAYS, REQUEST_WITHDRAW_REASON_CLIENT_LABEL, JOB_ISSUE_SANCTION_WINDOW_DAYS, jobPaidOnline, jobPaymentAdminLabel, toJobPaymentSummary, professionalRestrictions, MODERATION_ACTIONS_BY_TARGET, moderationGround, completionDeviation, courtesyDocumentLabel, normalizeAdminRoles, toJobIssueSummary, type JobIssueSummary, type ResolveJobIssueInput, type AdminRoleValue, type ResolveContentReportInput, TRAFFIC_SOURCES, type TrafficSource, type AdminProfessionalStats, PROFESSIONAL_ACTIVITY_DAYS, BANK_DISPUTE_OPEN_STATUSES } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { bookingSearchWhere } from "./admin-search";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { JobIssueOutcomeService } from "../job-issues/job-issue-outcome.service";
import { loadNotificationOptOuts } from "../notifications/opt-outs";
import { COUNTED_USER, countingFrom, daySinceLaunch, sinceLaunch } from "../site-counts/counted";
import { launchDate } from "../subscriptions/subscription-rules";
import { buildCategoryActivity, buildChurnByMonth, buildCoverage, buildProfessionalStats, buildSearchStats, professionalStatusOf } from "./professional-stats";

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
  /** Segnato "Account di prova" (docs/CHANGELOG.md §395). */
  testAccountAt: string | null;
};

export type AdminUsersPage = { total: number; page: number; pageSize: number; rows: AdminUserRow[] };

export type AdminOverview = {
  openReports: number;
  pendingAppeals: number;
  openMessages: number;
  pendingRefunds: number;
  openDisputes: number;
  /** Segnalazioni di problemi sul lavoro da decidere (docs/CHANGELOG.md §164). */
  openJobIssues: number;
  /** Ricorsi dei professionisti su segnalazioni accolte, da decidere (§167). */
  jobIssueAppeals: number;
  /** Pagamenti online attivi (chiave Stripe presente). */
  paymentsEnabled: boolean;
  /** Saldi dei pagamenti online non pagati entro 7 giorni (§168). */
  unpaidBalances: number;
  newUsers7d: number;
  clients: number;
  professionals: number;
  suspendedUsers: number;
  hiddenLeads: number;
  waitlist: number;
  /** Professionisti che hanno chiesto la verifica (docs/CHANGELOG.md §201). */
  verificationRequests: number;
  /** Zone con le richieste generali chiuse (docs/CHANGELOG.md §213). */
  closedGeneralRequestZones: number;
  openProblemTakeovers: number;
  /** Contestazioni in banca a cui rispondere e la scadenza più vicina (docs/changelog/2026-10-28-stripe-prova.md). */
  bankDisputesToAnswer: number;
  nextBankDisputeDueBy: string | null;
  /** Nostre fatture scartate dallo SdI, da correggere e rimandare. */
  sdiRejectedInvoices: number;
};

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly auditLogService: AuditLogService,
    private readonly jobIssueOutcomeService: JobIssueOutcomeService,
    private readonly securityAlerts: AdminSecurityAlertsService,
  ) {}

  /**
   * Richieste di preventivo degli ultimi 30 giorni per provenienza della
   * visita (docs/CHANGELOG.md §296): la prova che Google porta lavoro. Una
   * richiesta con più categorie conta una volta sola (`submissionGroupId`).
   * Le richieste senza provenienza (prima di questa funzione, o browser che
   * non la dà) finiscono in "unknown".
   */
  async getTrafficSources(): Promise<{ days: number; total: number; bySource: { source: TrafficSource | "unknown"; count: number }[] }> {
    const days = 30;
    // Dal lancio e senza account di prova (docs/CHANGELOG.md §395).
    const since = sinceLaunch(new Date(Date.now() - days * 24 * 60 * 60 * 1000), countingFrom());
    const rows = await this.prisma.guidedRequest.findMany({
      where: { createdAt: { gte: since }, client: COUNTED_USER },
      select: { id: true, submissionGroupId: true, trafficSource: true },
    });
    const seen = new Set<string>();
    const counts = new Map<TrafficSource | "unknown", number>();
    for (const row of rows) {
      const key = row.submissionGroupId ?? row.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const source = row.trafficSource ?? "unknown";
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }

    const order: (TrafficSource | "unknown")[] = [...TRAFFIC_SOURCES, "unknown"];
    return {
      days,
      total: seen.size,
      bySource: order.map((source) => ({ source, count: counts.get(source) ?? 0 })),
    };
  }

  /**
   * Quante persone spengono ogni avviso, per professionisti e clienti
   * (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md). Senza
   * gli account di prova e quelli chiusi.
   */
  notificationOptOuts() {
    return loadNotificationOptOuts(this.prisma);
  }

  /**
   * Utenti con ricerca, filtri e paginazione (docs/CHANGELOG.md §144): prima
   * arrivavano tutti insieme, senza id, ricerca né stato (un account
   * eliminato sembrava attivo). Ricerca su email, nome, cognome e nome
   * attività, senza distinzione tra maiuscole e minuscole.
   */
  /**
   * Professionisti in numeri (docs/CHANGELOG.md §368): totale e divisione per
   * stato, categoria, città, abbonamento, forma e mese d'iscrizione, con i
   * filtri per categoria e città. Senza eliminati, dimostrativi e account di
   * prova, contati a parte. Chi è iscritto conta da quando si è iscritto
   * (anche prima del lancio, reclutato al telefono); richieste, risposte,
   * ricerche e abbandoni solo dal lancio (docs/CHANGELOG.md §395).
   */
  async getProfessionalStats(params: { category?: string; city?: string }): Promise<AdminProfessionalStats> {
    const filter = professionalFilterWhere(params);
    const active: Prisma.ProfessionalProfileWhereInput = { deletedAt: null, user: { deletedAt: null } };
    const notTest: Prisma.ProfessionalProfileWhereInput = { isDemo: false, user: COUNTED_USER };
    const counted: Prisma.ProfessionalProfileWhereInput = { AND: [filter, active, notTest] };
    const now = new Date();
    const from = countingFrom(now);
    const launch = launchDate();
    const since30 = sinceLaunch(new Date(now.getTime() - 30 * DAY_MS), from);
    const since90 = sinceLaunch(new Date(now.getTime() - PROFESSIONAL_ACTIVITY_DAYS * DAY_MS), from);
    const since12m = sinceLaunch(new Date(now.getTime() - 366 * DAY_MS), from);
    // Richieste, risposte e preventivi: la categoria è quella della richiesta.
    const requestCategory = params.category?.trim() ? { category: { slug: params.category.trim() } } : {};
    const proAnswer = { actor: "PROFESSIONAL" as const, automatic: false };
    const [rows, deleted, demo, test, cities, activeQuotes, activeMessages, requests, leads, quotes, reviews, deletedProfiles, canceled] = await Promise.all([
      this.prisma.professionalProfile.findMany({ where: counted, select: PROFESSIONAL_STATS_SELECT }),
      this.prisma.professionalProfile.count({ where: { AND: [filter, { OR: [{ deletedAt: { not: null } }, { user: { deletedAt: { not: null } } }] }] } }),
      this.prisma.professionalProfile.count({ where: { AND: [filter, active, { isDemo: true }] } }),
      this.prisma.professionalProfile.count({ where: { AND: [filter, active, { isDemo: false, user: { testAccountAt: { not: null } } }] } }),
      this.prisma.professionalProfile.groupBy({ by: ["city"], where: { AND: [active, notTest] }, orderBy: { city: "asc" } }),
      this.prisma.quote.groupBy({ by: ["professionalProfileId"], where: { createdAt: { gte: since30 }, professionalProfile: counted } }),
      this.prisma.conversationEvent.groupBy({ by: ["professionalProfileId"], where: { ...proAnswer, createdAt: { gte: since30 }, professionalProfile: counted } }),
      this.prisma.guidedRequest.findMany({
        where: {
          createdAt: { gte: since90 },
          hiddenAt: null,
          client: COUNTED_USER,
          ...requestCategory,
          ...(params.city?.trim() ? { city: { equals: params.city.trim(), mode: "insensitive" as const } } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: { city: true, category: { select: { slug: true } }, _count: { select: { quotes: true } } },
      }),
      this.prisma.lead.findMany({
        where: { createdAt: { gte: since90 }, professionalProfile: counted, guidedRequest: requestCategory },
        select: { guidedRequestId: true, professionalProfileId: true, createdAt: true, status: true, guidedRequest: { select: { category: { select: { slug: true } } } } },
      }),
      this.prisma.quote.findMany({
        where: { createdAt: { gte: since90 }, professionalProfile: counted, guidedRequest: requestCategory },
        select: { status: true, booking: { select: { id: true } }, guidedRequest: { select: { category: { select: { slug: true } } } } },
      }),
      this.prisma.review.findMany({
        where: { hiddenAt: null, booking: { professionalProfile: counted, client: COUNTED_USER }, ...(from ? { createdAt: { gte: from } } : {}) },
        select: {
          rating: true,
          booking: {
            select: {
              quote: { select: { guidedRequest: { select: { category: { select: { slug: true } } } } } },
              professionalProfile: { select: { category: { select: { slug: true } } } },
            },
          },
        },
      }),
      this.prisma.professionalProfile.findMany({ where: { AND: [filter, notTest, { deletedAt: { gte: since12m } }] }, select: { deletedAt: true } }),
      this.prisma.subscription.findMany({
        where: { updatedAt: { gte: since12m }, OR: [{ status: "CANCELED" }, { cancelAtPeriodEnd: true }], professionalProfile: { AND: [filter, notTest] } },
        select: { updatedAt: true },
      }),
    ]);

    // Ricerche sul sito (§370): contatori per giorno, città salvata in minuscolo.
    const searchCity = params.city?.trim() ? { city: params.city.trim().toLowerCase() } : {};
    const searchDay = { day: { gte: daySinceLaunch(new Date(Date.UTC(since90.getUTCFullYear(), since90.getUTCMonth(), since90.getUTCDate())), from) } };
    const [categorySearchDays, freeSearchDays] = await Promise.all([
      this.prisma.categorySearchDay.findMany({
        where: { ...searchDay, ...searchCity, ...requestCategory },
        select: { city: true, count: true, emptyCount: true, category: { select: { slug: true } } },
      }),
      // Con un lavoro scelto nel filtro le ricerche senza lavoro non c'entrano.
      params.category?.trim() ? Promise.resolve([]) : this.prisma.freeSearchDay.findMany({ where: { ...searchDay, ...searchCity }, select: { city: true, withText: true, count: true, emptyCount: true } }),
    ]);

    // Prima risposta del professionista a ogni richiesta ricevuta: preventivo o messaggio.
    const requestIds = [...new Set(leads.map((l) => l.guidedRequestId))];
    const [firstQuotes, firstMessages] = requestIds.length
      ? await Promise.all([
          this.prisma.quote.groupBy({ by: ["guidedRequestId", "professionalProfileId"], where: { guidedRequestId: { in: requestIds } }, _min: { createdAt: true } }),
          this.prisma.conversationEvent.groupBy({ by: ["guidedRequestId", "professionalProfileId"], where: { ...proAnswer, guidedRequestId: { in: requestIds } }, _min: { createdAt: true } }),
        ])
      : [[], []];
    const firstAnswer = new Map<string, Date>();
    for (const row of [...firstQuotes, ...firstMessages]) {
      const at = row._min.createdAt;
      if (!at) continue;
      const key = `${row.guidedRequestId}|${row.professionalProfileId}`;
      const prev = firstAnswer.get(key);
      if (!prev || at < prev) firstAnswer.set(key, at);
    }

    const statsRows = rows.map(({ category, extraCategories, agendaWeekTemplate, _count, ...row }) => ({
      ...row,
      categorySlugs: [category.slug, ...extraCategories.map((c) => c.slug)],
      hasAgenda: agendaWeekTemplate !== null || _count.availabilitySlots > 0,
      servicesCount: _count.services,
      quotesCount: _count.quotes,
      bookingsCount: _count.bookings,
    }));
    const visibleRows = statsRows.filter((row) => professionalStatusOf(row, now) === "VISIBLE");
    const reviewCategory = params.category?.trim();
    return buildProfessionalStats(statsRows, now, {
      cityOptions: cities.map((c) => c.city).filter((c) => c.trim()),
      excluded: { deleted, demo, test },
      countingFrom: from?.toISOString() ?? null,
      launchDate: launch?.toISOString() ?? null,
      activeIds: new Set([...activeQuotes, ...activeMessages].map((r) => r.professionalProfileId)),
      coverage: buildCoverage(
        requests.map((r) => ({ categorySlug: r.category.slug, city: r.city, quotes: r._count.quotes })),
        visibleRows,
      ),
      byCategoryActivity: buildCategoryActivity({
        leads: leads.map((l) => ({
          categorySlug: l.guidedRequest.category.slug,
          createdAt: l.createdAt,
          answeredAt: firstAnswer.get(`${l.guidedRequestId}|${l.professionalProfileId}`) ?? null,
          declined: l.status === "DECLINED",
        })),
        quotes: quotes.map((q) => ({ categorySlug: q.guidedRequest.category.slug, accepted: q.status === "ACCEPTED" || q.booking !== null })),
        reviews: reviews
          .map((r) => ({ categorySlug: r.booking.quote?.guidedRequest.category.slug ?? r.booking.professionalProfile.category.slug, rating: r.rating }))
          .filter((r) => !reviewCategory || r.categorySlug === reviewCategory),
      }),
      churnByMonth: buildChurnByMonth(
        {
          deletedAt: deletedProfiles.flatMap((p) => (p.deletedAt ? [p.deletedAt] : [])),
          pausedAt: statsRows.flatMap((row) => (row.pausedAt && row.pausedAt >= since12m ? [row.pausedAt] : [])),
          canceledAt: canceled.map((c) => c.updatedAt),
        },
        now,
      ),
      searches: buildSearchStats(
        {
          categoryDays: categorySearchDays.map((d) => ({ categorySlug: d.category.slug, city: d.city, count: d.count, emptyCount: d.emptyCount })),
          freeDays: freeSearchDays,
        },
        visibleRows,
      ),
    });
  }

  async listUsers(params: { q?: string; role?: string; status?: string; category?: string; city?: string; page?: number }): Promise<AdminUsersPage> {
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

  private buildUserWhere(params: { q?: string; role?: string; status?: string; category?: string; city?: string }): Prisma.UserWhereInput {
    const q = params.q?.trim();
    // Categoria e città valgono per i professionisti (docs/CHANGELOG.md §368).
    const professional = params.category?.trim() || params.city?.trim() ? { professionalProfile: { is: professionalFilterWhere(params) } } : {};
    return {
      ...professional,
      ...(params.role === "CLIENT" || params.role === "PROFESSIONAL" || params.role === "ADMIN" ? { role: params.role } : {}),
      ...(params.status === "active" ? { deletedAt: null, suspendedAt: null } : {}),
      ...(params.status === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(params.status === "deleted" ? { deletedAt: { not: null } } : {}),
      ...(params.status === "test" ? { testAccountAt: { not: null } } : {}),
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
  async exportUsersCsv(params: { q?: string; role?: string; status?: string; category?: string; city?: string }): Promise<string> {
    const users = await this.prisma.user.findMany({ where: this.buildUserWhere(params), orderBy: { createdAt: "desc" }, select: USER_ROW_SELECT });
    const rows = users.map(toUserRow).map((u) => [
      u.email ?? "",
      u.name ?? "",
      u.surname ?? "",
      u.role,
      u.adminRoles.join("+"),
      u.businessName ?? "",
      u.deletedAt ? "eliminato" : u.suspendedAt ? "sospeso" : u.profileSuspended ? "profilo nascosto" : u.testAccountAt ? "account di prova" : "attivo",
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
        text: `${auditLabel(a)}${a.reason ? `: ${a.reason}` : ""}${a.changedByUserId ? ` (${adminEmails.get(a.changedByUserId) ?? "admin"})` : ""}`,
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
      testAccountAt: user.testAccountAt?.toISOString() ?? null,
      // Solo se è attiva, mai la chiave (docs/CHANGELOG.md §359).
      adminTwoFactorEnabled: user.role === "ADMIN" && Boolean(user.adminTotpEnabledAt),
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
   * Elimina per sempre un account di prova e tutto quello che ha creato
   * (richiesta di Luca, docs/CHANGELOG.md §372): richieste, preventivi,
   * lavori, recensioni, profilo. Così non resta nei numeri dell'andamento.
   * Solo super admin, mai un admin né sé stessi, mai un account con soldi
   * veri passati online. Per un utente vero resta l'eliminazione normale.
   */
  async deleteTestAccount(adminUserId: string, userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, professionalProfile: { select: { id: true } } },
    });
    if (!target) throw new NotFoundException("Utente non trovato.");
    if (target.id === adminUserId) throw new BadRequestException("Non puoi eliminare il tuo stesso account.");
    if (target.role === "ADMIN") throw new BadRequestException("Togli prima il ruolo di amministratore a questo account.");
    const paidOnline = await this.prisma.jobPayment.count({
      where: {
        depositPaidAt: { not: null },
        booking: { OR: [{ clientId: userId }, ...(target.professionalProfile ? [{ professionalProfileId: target.professionalProfile.id }] : [])] },
      },
    });
    if (paidOnline > 0) throw new BadRequestException("Questo account ha pagamenti online veri: non è un account di prova. Usa la sospensione.");
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch {
      throw new BadRequestException("Non si può eliminare: ha dati collegati che vanno tenuti. Usa la sospensione.");
    }
    await this.auditLogService.record({
      entityType: "User",
      entityId: userId,
      fieldName: "testAccount",
      oldValue: target.email ?? null,
      newValue: "DELETED",
      changedByUserId: adminUserId,
      reason: "Account di prova eliminato",
    });
    return { id: userId, deleted: true };
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
    // Email a tutti i super admin (§359): un admin nominato da un account rubato si vede subito.
    await this.securityAlerts.adminRolesChanged(adminUserId, userId, nextRoles);
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
        label: auditLabel(r),
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
    // Iscritti da sempre (anche prima del lancio); richieste e lavori solo dal
    // lancio; mai gli account di prova (docs/CHANGELOG.md §395).
    const activityStart = sinceLaunch(start, countingFrom());
    const [users, requests, bookings, reports] = await Promise.all([
      this.prisma.user.findMany({ where: { createdAt: { gte: start }, ...COUNTED_USER }, select: { createdAt: true, role: true } }),
      this.prisma.guidedRequest.findMany({ where: { createdAt: { gte: activityStart }, client: COUNTED_USER }, select: { createdAt: true } }),
      this.prisma.booking.findMany({ where: { createdAt: { gte: activityStart }, client: COUNTED_USER }, select: { createdAt: true } }),
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
    const [openReports, pendingAppeals, openMessages, pendingRefunds, openDisputes, newUsers7d, clients, professionals, suspendedUsers, hiddenLeads, waitlist, openJobIssues, jobIssueAppeals, unpaidBalances, verificationRequests, closedGeneralRequestZones, openProblemTakeovers] =
      await Promise.all([
        this.prisma.contentReport.count({ where: { status: "OPEN" } }),
        this.prisma.contentReport.count({ where: { appealedAt: { not: null }, appealRejectedAt: null, revertedAt: null } }),
        this.prisma.contactMessage.count({ where: { resolved: false } }),
        this.prisma.refund.count({ where: { status: "REQUESTED" } }),
        this.prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
        // Senza account di prova (docs/CHANGELOG.md §395).
        this.prisma.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null, ...COUNTED_USER } }),
        this.prisma.user.count({ where: { role: "CLIENT", deletedAt: null, ...COUNTED_USER } }),
        this.prisma.user.count({ where: { role: "PROFESSIONAL", deletedAt: null, ...COUNTED_USER } }),
        this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
        this.prisma.lead.count({ where: { hiddenByProfessionalAt: { not: null } } }),
        this.prisma.waitlistSignup.count(),
        this.prisma.jobIssue.count({ where: { status: "OPEN" } }),
        this.prisma.jobIssue.count({ where: { appealedAt: { not: null }, appealDecision: null } }),
        this.prisma.jobPayment.count({ where: { balanceUnpaidAt: { not: null } } }),
        // "Richiedi la verifica" in attesa (docs/CHANGELOG.md §201).
        this.prisma.professionalProfile.count({
          where: { verificationRequestedAt: { not: null }, verified: false, deletedAt: null, invitePendingAt: null },
        }),
        this.prisma.generalRequestBlock.count({ where: { reopenedAt: null } }),
        // "Ce ne occupiamo noi" da seguire (docs/CHANGELOG.md §392).
        this.prisma.problemTakeover.count({ where: { status: "OPEN" } }),
      ]);
    // Da fare in Home (docs/changelog/2026-10-28-stripe-prova.md): contestazioni
    // in banca da rispondere con la scadenza più vicina, fatture scartate dallo SdI.
    const [bankDisputesToAnswer, nextBankDispute, sdiRejectedInvoices] = await Promise.all([
      this.prisma.jobPayment.count({ where: { stripeDisputeStatus: { in: [...BANK_DISPUTE_OPEN_STATUSES] } } }),
      this.prisma.jobPayment.findFirst({
        where: { stripeDisputeStatus: { in: [...BANK_DISPUTE_OPEN_STATUSES] }, stripeDisputeDueBy: { not: null } },
        orderBy: { stripeDisputeDueBy: "asc" },
        select: { stripeDisputeDueBy: true },
      }),
      this.prisma.invoice.count({ where: { sdiStatus: "REJECTED" } }),
    ]);
    return {
      openReports,
      pendingAppeals,
      openMessages,
      pendingRefunds,
      openDisputes,
      newUsers7d,
      clients,
      professionals,
      suspendedUsers,
      hiddenLeads,
      waitlist,
      openJobIssues,
      jobIssueAppeals,
      paymentsEnabled: !!process.env.STRIPE_SECRET_KEY,
      unpaidBalances,
      verificationRequests,
      closedGeneralRequestZones,
      openProblemTakeovers,
      bankDisputesToAnswer,
      nextBankDisputeDueBy: nextBankDispute?.stripeDisputeDueBy?.toISOString() ?? null,
      sdiRejectedInvoices,
    };
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

  async promoteToAdmin(typedEmail: string): Promise<{ email: string; role: string }> {
    // Email degli account in minuscolo (§330).
    const email = typedEmail.trim().toLowerCase();
    // Solo per il primissimo admin (docs/CHANGELOG.md §359): se ne esiste già
    // uno il codice non serve più, gli altri si nominano da Utenti. Con un
    // database nuovo (quello gratuito di Render scade) torna a funzionare.
    const admins = await this.prisma.user.count({ where: { role: "ADMIN", deletedAt: null } });
    if (admins > 0) {
      throw new ForbiddenException("Esiste già un amministratore: i nuovi admin si nominano dalla pagina Utenti dell'area admin.");
    }
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
    // `/professionista/{id}#recensione-{reviewId}`).
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
      claimsIllegal: report.claimsIllegal,
      goodFaithAt: report.goodFaithAt?.toISOString() ?? null,
      ground: report.ground,
      photoUrls: report.photoUrls,
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
   * - DISMISSED: nessuna misura.
   * - RESOLVED: applica davvero la misura scelta (`action`, compatibile col
   *   tipo di contenuto — `MODERATION_ACTIONS_BY_TARGET`), poi manda
   *   all'autore misura, regola violata, motivazione e possibilità di
   *   contestare (pagina /segnalazioni).
   * Il segnalante riceve l'esito in una riga solo se ha segnalato un
   * contenuto illegale (docs/CHANGELOG.md §319).
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
    if (status === "RESOLVED" && !moderationGround(input.ground)) {
      // DSA art. 17 c. 3 lett. d-e (docs/CHANGELOG.md §319): l'autore deve sapere quale regola o legge ha violato.
      throw new BadRequestException("Scegli la regola o la legge violata.");
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
          ground: status === "RESOLVED" ? (input.ground ?? null) : null,
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

    // Esito a chi segnala solo per un contenuto illegale (DSA art. 16 c. 5,
    // docs/CHANGELOG.md §319), in una riga e mai con la motivazione: per una
    // violazione dei Termini basta la presa in carico già inviata.
    if (report.claimsIllegal) {
      await this.notificationsService.notify(report.reporterId, "CONTENT_REPORT_DECISION", {
        targetType: report.targetType,
        status,
      });
    }

    if (status === "RESOLVED" && ownerUserId) {
      await this.notificationsService.notify(ownerUserId, "CONTENT_REPORT_UPHELD", {
        contentReportId: report.id,
        targetType: report.targetType,
        action,
        ground: input.ground ?? null,
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
   * risolvere `targetLabel`.
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
    const request = await this.prisma.guidedRequest.findUnique({ where: { id: targetId }, select: { clientId: true } });
    return request?.clientId ?? null;
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

  /**
   * Richieste eliminate dai clienti (docs/CHANGELOG.md §343): spariscono per
   * il cliente ma restano qui, con chat e preventivi, fino alla
   * cancellazione vera dopo CLIENT_DELETED_REQUEST_RETENTION_DAYS. Quelle
   * segnalate da un professionista restano sempre (prove della moderazione).
   * Mai telefono, email o indirizzo del cliente.
   */
  async listClientDeletedRequests(): Promise<AdminClientDeletedRequestRow[]> {
    const requests = await this.prisma.guidedRequest.findMany({
      where: { deletedByClientAt: { not: null } },
      orderBy: { deletedByClientAt: "desc" },
      take: 200,
      select: {
        id: true,
        description: true,
        city: true,
        createdAt: true,
        deletedByClientAt: true,
        withdrawReason: true,
        deletedWhileOpen: true,
        category: { select: { label: true } },
        client: { select: { name: true, surname: true, deletedAt: true } },
        _count: { select: { leads: true, quotes: true, timelineEvents: { where: { automatic: false } } } },
      },
    });
    const reports = requests.length
      ? await this.prisma.contentReport.findMany({
          where: { targetType: "GUIDED_REQUEST", targetId: { in: requests.map((r) => r.id) } },
          select: { targetId: true, status: true },
        })
      : [];
    const reportsByRequest = new Map<string, string[]>();
    for (const report of reports) reportsByRequest.set(report.targetId, [...(reportsByRequest.get(report.targetId) ?? []), report.status]);
    return requests.map((request) => {
      const deletedAt = request.deletedByClientAt as Date;
      const reportStatuses = reportsByRequest.get(request.id) ?? [];
      return {
        guidedRequestId: request.id,
        categoryLabel: request.category.label,
        city: request.city,
        description: request.description,
        clientName: request.client.deletedAt ? null : [request.client.name, request.client.surname].filter(Boolean).join(" ") || null,
        clientAccountDeleted: request.client.deletedAt !== null,
        reasonLabel: request.withdrawReason ? REQUEST_WITHDRAW_REASON_CLIENT_LABEL[request.withdrawReason] : null,
        wasOpen: request.deletedWhileOpen,
        professionalsReached: request._count.leads,
        quotes: request._count.quotes,
        messages: request._count.timelineEvents,
        reports: reportStatuses.length,
        openReports: reportStatuses.filter((status) => status === "OPEN").length,
        requestCreatedAt: request.createdAt.toISOString(),
        deletedAt: deletedAt.toISOString(),
        // Segnalata: resta sempre (decisione dell'utente).
        purgeAt: reportStatuses.length > 0 ? null : new Date(deletedAt.getTime() + CLIENT_DELETED_REQUEST_RETENTION_DAYS * 24 * 60 * 60_000).toISOString(),
      };
    });
  }

  /**
   * Lavori terminati (docs/CHANGELOG.md §163): note, foto/video di entrambe
   * le parti e motivo delle differenze dal preventivo. `filter`: "changes"
   * solo con voci aggiunte o totale fuori preventivo, "notes" solo con note.
   */
  async listCompletedJobs(filter: "all" | "changes" | "notes"): Promise<AdminCompletedJobRow[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [{ status: "COMPLETED" }, { clientConfirmedCompletedAt: { not: null } }],
        // I profili dimostrativi del seed hanno decine di lavori finti senza note.
        professionalProfile: { isDemo: false },
        ...(filter === "changes" ? { completionChangeReason: { not: null } } : {}),
        ...(filter === "notes" ? { AND: [{ OR: [{ professionalCompletionNote: { not: null } }, { clientCompletionNote: { not: null } }] }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        finalItems: true,
        jobPayment: true,
        courtesyDocument: { select: { kind: true, number: true, year: true, ownNumber: true } },
        professionalProfile: { select: { id: true, userId: true, businessName: true } },
        client: { select: { id: true, name: true, surname: true, deletedAt: true } },
        quote: {
          select: {
            items: true,
            guidedRequest: { select: { id: true, city: true, description: true, category: { select: { label: true } } } },
          },
        },
      },
    });
    return bookings.map((booking) => {
      const deviation = completionDeviation(booking.quote?.items ?? [], booking.finalItems);
      const added = new Set(deviation?.addedItemNames ?? []);
      const request = booking.quote?.guidedRequest ?? null;
      return {
        bookingId: booking.id,
        guidedRequestId: request?.id ?? null,
        categoryLabel: request?.category.label ?? null,
        city: request?.city ?? null,
        description: request?.description ?? null,
        scheduledAt: booking.scheduledAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString(),
        professional: { profileId: booking.professionalProfile.id, userId: booking.professionalProfile.userId, businessName: booking.professionalProfile.businessName },
        client: {
          userId: booking.client.id,
          name: booking.client.deletedAt ? null : [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
          accountDeleted: booking.client.deletedAt !== null,
        },
        professionalCompleted: booking.status === "COMPLETED",
        clientConfirmedAt: booking.clientConfirmedCompletedAt?.toISOString() ?? null,
        quoteMinEurCents: deviation?.quoteMinEurCents ?? null,
        quoteMaxEurCents: deviation?.quoteMaxEurCents ?? null,
        finalAmountEurCents: booking.finalAmountEurCents,
        finalItems: booking.finalItems.map((item) => ({ name: item.name, priceEurCents: item.priceEurCents, added: added.has(item.name.trim()) })),
        direction: deviation?.direction ?? null,
        changeReason: booking.completionChangeReason,
        professionalNote: booking.professionalCompletionNote,
        clientNote: booking.clientCompletionNote,
        professionalPhotoUrls: booking.professionalCompletionPhotoUrls,
        clientPhotoUrls: booking.clientCompletionPhotoUrls,
        // Come è stato pagato, saldo diretto compreso (docs/CHANGELOG.md §239).
        paymentLabel: jobPaymentAdminLabel(toJobPaymentSummary(booking.jobPayment, booking.finalAmountEurCents)),
        courtesyDocumentLabel: booking.courtesyDocument ? courtesyDocumentLabel(booking.courtesyDocument) : null,
      };
    });
  }

  /**
   * Segnalazioni di problemi sul lavoro (docs/CHANGELOG.md §164-§165): da
   * decidere ("open"), ancora in chat tra le parti ("chat") o chiuse
   * ("closed"), con tutto ciò che serve per
   * decidere: descrizione e foto del cliente, versione del professionista,
   * note e foto a lavoro terminato, importi.
   */
  async listJobIssues(view: "open" | "chat" | "appeals" | "closed", adminUserId: string, q = ""): Promise<AdminJobIssueRow[]> {
    // Con la ricerca si cerca in tutte le segnalazioni, aperte e chiuse (archivio,
    // docs/changelog/2026-10-28-stripe-prova.md).
    const booking = bookingSearchWhere(q);
    const issues = await this.prisma.jobIssue.findMany({
      where: booking
        ? { OR: [{ booking }, { description: { contains: q.trim(), mode: "insensitive" } }] }
        : view === "open"
          ? { status: "OPEN" }
          : view === "chat"
            ? { status: "CHAT" }
            : view === "appeals"
              ? { appealedAt: { not: null }, appealDecision: null }
              : { status: { in: ["UPHELD", "REJECTED", "RESOLVED", "UNRESOLVED"] } },
      orderBy: booking || view === "closed" ? { createdAt: "desc" } : view === "appeals" ? { appealedAt: "asc" } : { createdAt: "asc" },
      take: 200,
      include: {
        booking: {
          include: {
            professionalProfile: { select: { id: true, userId: true, businessName: true, demotedUntil: true, requestsBlockedUntil: true } },
            client: { select: { id: true, name: true, surname: true, deletedAt: true } },
            quote: { select: { guidedRequest: { select: { id: true, city: true, description: true, category: { select: { label: true } } } } } },
            jobPayment: { select: { paymentMethod: true, status: true, paidEurCents: true, refundedEurCents: true } },
            courtesyDocument: { select: { kind: true, number: true, year: true, ownNumber: true } },
          },
        },
      },
    });
    const since = new Date(Date.now() - JOB_ISSUE_SANCTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const profileIds = [...new Set(issues.map((i) => i.booking.professionalProfileId))];
    const upheldCounts = await this.prisma.jobIssue.findMany({
      where: { status: "UPHELD", resolvedAt: { gte: since }, booking: { professionalProfileId: { in: profileIds } } },
      select: { booking: { select: { professionalProfileId: true } } },
    });
    const upheldBy = new Map<string, number>();
    for (const row of upheldCounts) upheldBy.set(row.booking.professionalProfileId, (upheldBy.get(row.booking.professionalProfileId) ?? 0) + 1);
    const chatReplies = await this.jobIssueOutcomeService.proChatReplies(
      issues
        .filter((i) => i.status === "CHAT")
        .map((i) => ({
          id: i.id,
          createdAt: i.createdAt,
          professionalRespondedAt: i.professionalRespondedAt,
          refundOfferedAt: i.refundOfferedAt,
          guidedRequestId: i.booking.quote?.guidedRequest.id ?? null,
          professionalProfileId: i.booking.professionalProfileId,
        })),
    );
    const now = new Date();
    return issues.map((issue) => {
      const booking = issue.booking;
      const request = booking.quote?.guidedRequest ?? null;
      const restrictions = professionalRestrictions(booking.professionalProfile, now);
      return {
        issue: toJobIssueSummary(issue, {
          proRepliedAt: chatReplies.get(issue.id) ?? null,
          paidOnline: jobPaidOnline(booking.jobPayment),
          assisted: booking.jobPayment?.paymentMethod !== "DIRECT",
        }) as JobIssueSummary,
        bookingId: booking.id,
        guidedRequestId: request?.id ?? null,
        categoryLabel: request?.category.label ?? null,
        city: request?.city ?? null,
        requestDescription: request?.description ?? null,
        scheduledAt: booking.scheduledAt.toISOString(),
        bookingStatus: booking.status,
        professional: {
          profileId: booking.professionalProfile.id,
          userId: booking.professionalProfile.userId,
          businessName: booking.professionalProfile.businessName,
          upheldLast30Days: upheldBy.get(booking.professionalProfileId) ?? 0,
          demoted: restrictions.demoted,
          blocked: restrictions.blocked,
        },
        client: {
          userId: booking.client.id,
          name: booking.client.deletedAt ? null : [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
          accountDeleted: booking.client.deletedAt !== null,
        },
        // Il ricorso lo decide un admin diverso da chi ha deciso la segnalazione (§167).
        decidedByMe: issue.resolvedByUserId === adminUserId,
        finalAmountEurCents: booking.finalAmountEurCents,
        // Cifra che un rimborso del 100% restituirebbe ora, per mostrarla in euro prima di decidere.
        refundableEurCents: booking.jobPayment?.paymentMethod === "MANOVIA" ? Math.max(0, booking.jobPayment.paidEurCents - booking.jobPayment.refundedEurCents) : null,
        professionalCompletedAt: booking.professionalCompletedAt?.toISOString() ?? null,
        clientConfirmedAt: booking.clientConfirmedCompletedAt?.toISOString() ?? null,
        professionalCompletionNote: booking.professionalCompletionNote,
        completionChangeReason: booking.completionChangeReason,
        clientCompletionNote: booking.clientCompletionNote,
        professionalCompletionPhotoUrls: booking.professionalCompletionPhotoUrls,
        clientCompletionPhotoUrls: booking.clientCompletionPhotoUrls,
        courtesyDocumentLabel: booking.courtesyDocument ? courtesyDocumentLabel(booking.courtesyDocument) : null,
      };
    });
  }

  /**
   * Decisione su una segnalazione (docs/CHANGELOG.md §164, §167): esito,
   * misure progressive, affidabilità e rimborso dei lavori pagati sul sito
   * sono in JobIssueOutcomeService, condiviso con le decisioni automatiche.
   */
  async resolveJobIssue(adminUserId: string, issueId: string, input: ResolveJobIssueInput): Promise<{ id: string; status: string }> {
    return this.jobIssueOutcomeService.decide(issueId, { decision: input.decision, note: input.note.trim(), byUserId: adminUserId, refundPercent: input.refundPercent });
  }

  /**
   * Tutte le chat tra cliente e professionista (docs/CHANGELOG.md §166,
   * richiesta esplicita dell'utente: anche senza una segnalazione). Una riga
   * per coppia richiesta-professionista, la più recente in cima; `q` filtra
   * per nome del cliente o del professionista o per email del cliente.
   */
  async listConversations(q?: string): Promise<AdminConversationRow[]> {
    const query = q?.trim();
    const events = await this.prisma.conversationEvent.findMany({
      where: query
        ? {
            OR: [
              { professionalProfile: { businessName: { contains: query, mode: "insensitive" } } },
              { guidedRequest: { client: { name: { contains: query, mode: "insensitive" } } } },
              { guidedRequest: { client: { surname: { contains: query, mode: "insensitive" } } } },
              { guidedRequest: { client: { email: { contains: query, mode: "insensitive" } } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        guidedRequestId: true,
        professionalProfileId: true,
        actor: true,
        message: true,
        createdAt: true,
        guidedRequest: { select: { city: true, category: { select: { label: true } }, client: { select: { id: true, name: true, surname: true, deletedAt: true } } } },
        professionalProfile: { select: { businessName: true, userId: true } },
      },
    });
    const rows = new Map<string, AdminConversationRow>();
    for (const event of events) {
      const key = `${event.guidedRequestId}:${event.professionalProfileId}`;
      const existing = rows.get(key);
      if (existing) {
        existing.messageCount += 1;
        continue;
      }
      if (rows.size >= 200) continue;
      const client = event.guidedRequest.client;
      rows.set(key, {
        guidedRequestId: event.guidedRequestId,
        professionalProfileId: event.professionalProfileId,
        categoryLabel: event.guidedRequest.category.label,
        city: event.guidedRequest.city,
        clientUserId: client.id,
        clientName: client.deletedAt ? null : [client.name, client.surname].filter(Boolean).join(" ") || null,
        professionalUserId: event.professionalProfile.userId,
        businessName: event.professionalProfile.businessName,
        lastMessage: event.message,
        lastActor: event.actor,
        lastMessageAt: event.createdAt.toISOString(),
        messageCount: 1,
      });
    }
    return [...rows.values()];
  }

  /**
   * Una chat per intero, in sola lettura. Ogni lettura resta nel registro
   * azioni: sono conversazioni private, l'accesso va tracciato.
   */
  async getConversation(adminUserId: string, guidedRequestId: string, professionalProfileId: string): Promise<AdminConversationDetail> {
    const request = await this.prisma.guidedRequest.findUnique({
      where: { id: guidedRequestId },
      select: {
        id: true,
        city: true,
        description: true,
        category: { select: { label: true } },
        client: { select: { id: true, name: true, surname: true, deletedAt: true } },
      },
    });
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { id: true, userId: true, businessName: true },
    });
    if (!request || !professional) throw new NotFoundException("Chat non trovata.");
    const events = await this.prisma.conversationEvent.findMany({
      where: { guidedRequestId, professionalProfileId },
      orderBy: { createdAt: "asc" },
    });
    if (events.length === 0) throw new NotFoundException("Chat non trovata.");
    await this.auditLogService.record({
      entityType: "Conversation",
      entityId: `${guidedRequestId}:${professionalProfileId}`,
      fieldName: "read",
      changedByUserId: adminUserId,
      reason: "Lettura della chat da parte di un admin",
    });
    const issue = await this.prisma.jobIssue.findFirst({
      where: { booking: { professionalProfileId, quote: { guidedRequestId } } },
      select: { type: true, status: true },
    });
    const client = request.client;
    return {
      guidedRequestId,
      professionalProfileId,
      categoryLabel: request.category.label,
      city: request.city,
      requestDescription: request.description,
      clientUserId: client.id,
      clientName: client.deletedAt ? null : [client.name, client.surname].filter(Boolean).join(" ") || null,
      professionalUserId: professional.userId,
      businessName: professional.businessName,
      issue: issue ? { type: issue.type, status: issue.status } : null,
      events: events.map((event) => ({
        id: event.id,
        actor: event.actor,
        message: event.message,
        mediaUrls: event.mediaUrls,
        createdAt: event.createdAt.toISOString(),
      })),
    };
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

export type AdminClientDeletedRequestRow = {
  guidedRequestId: string;
  categoryLabel: string;
  city: string;
  description: string;
  clientName: string | null;
  clientAccountDeleted: boolean;
  /** Motivo scelto dal cliente, `null` se non l'ha dato. */
  reasonLabel: string | null;
  /** Era ancora aperta: i professionisti l'hanno vista "Ritirata dal cliente". */
  wasOpen: boolean;
  professionalsReached: number;
  quotes: number;
  messages: number;
  reports: number;
  openReports: number;
  requestCreatedAt: string;
  deletedAt: string;
  /** Quando si cancella davvero; `null` se resta perché segnalata. */
  purgeAt: string | null;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Categoria (principale o aggiuntiva) e città di un professionista, per i numeri e per la lista utenti (§368). */
function professionalFilterWhere(params: { category?: string; city?: string }): Prisma.ProfessionalProfileWhereInput {
  const category = params.category?.trim();
  const city = params.city?.trim();
  return {
    AND: [
      ...(category ? [{ OR: [{ category: { slug: category } }, { extraCategories: { some: { slug: category } } }] }] : []),
      ...(city ? [{ city: { equals: city, mode: "insensitive" as const } }] : []),
    ],
  };
}

export const PROFESSIONAL_STATS_SELECT = {
  id: true,
  city: true,
  imageUrl: true,
  bio: true,
  verified: true,
  agendaWeekTemplate: true,
  _count: { select: { services: true, availabilitySlots: true, quotes: true, bookings: true } },
  createdAt: true,
  suspendedAt: true,
  pausedAt: true,
  invitePendingAt: true,
  requestsBlockedUntil: true,
  isDemo: true,
  category: { select: { slug: true } },
  extraCategories: { select: { slug: true } },
  user: { select: { suspendedAt: true } },
  fiscalProfile: { select: { entityType: true, fiscalDataCompleteAt: true, taxIdChecks: { where: { status: "INVALID" }, select: { status: true } } } },
  subscription: {
    select: { plan: true, status: true, trialEndsAt: true, cancelAtPeriodEnd: true, currentPeriodStart: true, currentPeriodEnd: true, founderNumber: true },
  },
} satisfies Prisma.ProfessionalProfileSelect;

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
  testAccountAt: true,
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
    testAccountAt: u.testAccountAt?.toISOString() ?? null,
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

export type AdminCompletedJobRow = {
  bookingId: string;
  guidedRequestId: string | null;
  categoryLabel: string | null;
  city: string | null;
  description: string | null;
  scheduledAt: string;
  updatedAt: string;
  professional: { profileId: string; userId: string; businessName: string };
  client: { userId: string; name: string | null; accountDeleted: boolean };
  professionalCompleted: boolean;
  clientConfirmedAt: string | null;
  quoteMinEurCents: number | null;
  quoteMaxEurCents: number | null;
  finalAmountEurCents: number | null;
  finalItems: { name: string; priceEurCents: number; added: boolean }[];
  direction: "ABOVE" | "BELOW" | null;
  changeReason: string | null;
  professionalNote: string | null;
  clientNote: string | null;
  professionalPhotoUrls: string[];
  clientPhotoUrls: string[];
  paymentLabel: string;
  /** Ricevuta o copia di cortesia preparata dal professionista (§380). */
  courtesyDocumentLabel: string | null;
};

export type AdminJobIssueRow = {
  issue: JobIssueSummary;
  bookingId: string;
  guidedRequestId: string | null;
  categoryLabel: string | null;
  city: string | null;
  requestDescription: string | null;
  scheduledAt: string;
  bookingStatus: string;
  professional: { profileId: string; userId: string; businessName: string; upheldLast30Days: number; demoted: boolean; blocked: boolean };
  client: { userId: string; name: string | null; accountDeleted: boolean };
  decidedByMe: boolean;
  finalAmountEurCents: number | null;
  professionalCompletedAt: string | null;
  clientConfirmedAt: string | null;
  professionalCompletionNote: string | null;
  completionChangeReason: string | null;
  clientCompletionNote: string | null;
  professionalCompletionPhotoUrls: string[];
  clientCompletionPhotoUrls: string[];
  courtesyDocumentLabel: string | null;
};

export type AdminConversationRow = {
  guidedRequestId: string;
  professionalProfileId: string;
  categoryLabel: string;
  city: string;
  clientUserId: string;
  clientName: string | null;
  professionalUserId: string;
  businessName: string;
  lastMessage: string;
  lastActor: string;
  lastMessageAt: string;
  /** Messaggi nella chat, compresi quelli automatici del ciclo di vita. */
  messageCount: number;
};

export type AdminConversationDetail = {
  guidedRequestId: string;
  professionalProfileId: string;
  categoryLabel: string;
  city: string;
  requestDescription: string;
  clientUserId: string;
  clientName: string | null;
  professionalUserId: string;
  businessName: string;
  issue: { type: string; status: string } | null;
  events: { id: string; actor: string; message: string; mediaUrls: string[]; createdAt: string }[];
};
