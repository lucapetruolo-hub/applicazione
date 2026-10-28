import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  CHURN_KINDS,
  CHURN_REASONS,
  CLIENT_FUNNEL_KEYS,
  PRICE_TOOL_STEP_KEYS,
  REQUEST_STEP_KEYS,
  SEARCH_DEMAND_ALERT_DAYS,
  SITE_ADVICE_DONE_DAYS,
  SITE_AUTOMATIC_NOTES,
  SITE_COHORT_WEEKS,
  SITE_STATS_WEEKS,
  SITE_STATS_WINDOW_DAYS,
  SUBMIT_FAILURE_KINDS,
  SUBMIT_FORM_KEYS,
  TRAFFIC_SOURCES,
  type AdminSiteStats,
  type ChurnKind,
  type ChurnReason,
  type ClientFunnelKey,
  type RequestStepKey,
  type SignupSourceKey,
  type SiteAdviceDoneInput,
  type SiteAdviceUndoInput,
  type SiteNoteInput,
  type SubmitFailureKind,
  type SubmitFormKey,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { identityVerificationRequired } from "../identity-verification/identity-provider-env";
import { hasLaunched, launchDate } from "../subscriptions/subscription-rules";
import { COUNTED_USER, countingFrom, daySinceLaunch, sinceLaunch } from "../site-counts/counted";
import { PROFESSIONAL_STATS_SELECT } from "./admin.service";
import { professionalStatusOf, searchDemandZones } from "./professional-stats";
import {
  buildClientCohorts,
  buildGuideCells,
  buildGuideWeekly,
  buildMissingServices,
  buildPopularServices,
  buildProfessionalCohorts,
  buildSiteAdvice,
  greenWeeksInARow,
  guideOutcome,
  launchReady,
  reconcile,
  weekStarts,
  type SiteRequestRow,
  type SiteServiceRow,
  type StalledProfessional,
} from "./site-stats";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Giorni del confronto tra richieste contate dal browser e richieste salvate. */
const RECONCILE_DAYS = 14;

const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Andamento del sito (docs/CHANGELOG.md §372): numero guida per lavoro e
 * città, percorso del cliente, coorti, conteggi e i consigli già pronti per
 * il super admin, anche nell'email del lunedì. Esclusi gli admin (le loro
 * richieste di prova), gli account di prova e i profili dimostrativi. Dal
 * lancio l'attività (richieste, ricerche, visite, preventivi) conta solo da
 * quel giorno (§395); chi è iscritto resta contato da quando si è iscritto.
 */
@Injectable()
export class SiteStatsService {
  private readonly logger = new Logger(SiteStatsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getStats(now: Date = new Date()): Promise<AdminSiteStats> {
    // Attività contata dal lancio (§395): ogni inizio periodo mai prima di quel giorno.
    const from = countingFrom(now);
    const fromLaunch = (date: Date) => sinceLaunch(date, from);
    const dayFromLaunch = (day: Date) => daySinceLaunch(day, from);
    const windowStart = fromLaunch(new Date(now.getTime() - SITE_STATS_WINDOW_DAYS * DAY_MS));
    const windowDay = dayFromLaunch(dayStart(new Date(now.getTime() - SITE_STATS_WINDOW_DAYS * DAY_MS)));
    const weeksStart = new Date(`${weekStarts(now, SITE_STATS_WEEKS)[0]}T00:00:00+01:00`);
    const cohortStart = new Date(`${weekStarts(now, SITE_COHORT_WEEKS)[0]}T00:00:00+01:00`);
    // Iscrizioni: chi si è iscritto prima del lancio è vero (reclutato al telefono), quindi niente data del lancio qui.
    const signupsSince90 = new Date(now.getTime() - 90 * DAY_MS);
    const since90 = fromLaunch(signupsSince90);
    const since30 = fromLaunch(new Date(now.getTime() - 30 * DAY_MS));
    const since14 = fromLaunch(new Date(now.getTime() - 14 * DAY_MS));
    const since7Day = dayFromLaunch(dayStart(new Date(now.getTime() - SEARCH_DEMAND_ALERT_DAYS * DAY_MS)));
    const notAdmin = { client: { role: { not: "ADMIN" as const }, ...COUNTED_USER } };
    const launchOn = from ? { createdAt: { gte: from } } : {};
    const proCounted: Prisma.ProfessionalProfileWhereInput = { deletedAt: null, user: { deletedAt: null, ...COUNTED_USER }, isDemo: false };

    const [requestRows, searchDays, freeSearches, profileViews, stepDays, proRows, failureDays, terms, termDays, signups, churnDays, notes, serviceSearches, serviceRows, priceToolDays] = await Promise.all([
      this.prisma.guidedRequest.findMany({
        where: { createdAt: { gte: fromLaunch(weeksStart < windowStart ? weeksStart : windowStart) }, hiddenAt: null, ...notAdmin },
        select: {
          id: true,
          submissionGroupId: true,
          clientId: true,
          city: true,
          createdAt: true,
          deletedByClientAt: true,
          category: { select: { slug: true } },
          quotes: { select: { createdAt: true, booking: { select: { status: true, review: { select: { id: true } } } } }, orderBy: { createdAt: "asc" } },
        },
      }),
      this.prisma.categorySearchDay.findMany({ where: { day: { gte: windowDay } }, select: { city: true, count: true, emptyCount: true, day: true, category: { select: { slug: true } } } }),
      this.prisma.freeSearchDay.aggregate({ where: { day: { gte: windowDay } }, _sum: { count: true } }),
      this.prisma.profileViewDay.aggregate({ where: { day: { gte: windowDay } }, _sum: { count: true } }),
      this.prisma.requestStepDay.groupBy({ by: ["step", "origin"], where: { day: { gte: windowDay } }, _sum: { count: true } }),
      this.prisma.professionalProfile.findMany({
        where: proCounted,
        select: { ...PROFESSIONAL_STATS_SELECT, businessName: true, user: { select: { suspendedAt: true, email: true, name: true, surname: true } } },
      }),
      this.prisma.submitFailureDay.findMany({ where: { day: { gte: windowDay } }, select: { form: true, kind: true, day: true, count: true } }),
      this.prisma.unknownJobTerm.findMany({ select: { termHash: true, term: true } }),
      this.prisma.unknownJobSearchDay.groupBy({ by: ["termHash"], where: { day: { gte: dayFromLaunch(dayStart(since90)) } }, _count: { _all: true }, _sum: { count: true } }),
      this.prisma.user.findMany({
        where: { role: "PROFESSIONAL", deletedAt: null, createdAt: { gte: signupsSince90 }, ...COUNTED_USER },
        select: { signupSource: true, _count: { select: { profileInvites: true } } },
      }),
      this.prisma.churnReasonDay.groupBy({ by: ["kind", "reason"], where: { day: { gte: dayFromLaunch(dayStart(since90)) } }, _sum: { count: true } }),
      this.prisma.siteNote.findMany({ where: { day: { gte: dayStart(weeksStart) } }, orderBy: { day: "asc" } }),
      this.prisma.serviceSearchDay.groupBy({ by: ["categorySlug", "service"], where: { day: { gte: dayFromLaunch(dayStart(since90)) } }, _sum: { count: true } }),
      this.prisma.professionalService.findMany({
        where: { professionalProfile: proCounted },
        select: {
          name: true,
          professionalProfileId: true,
          professionalProfile: { select: { category: { select: { slug: true } }, extraCategories: { select: { slug: true } } } },
        },
      }),
      this.prisma.priceToolStepDay.groupBy({ by: ["step"], where: { day: { gte: windowDay } }, _sum: { count: true } }),
    ]);

    const requests: SiteRequestRow[] = requestRows.map((r) => {
      const booking = r.quotes.find((q) => q.booking)?.booking ?? null;
      return {
        groupKey: r.submissionGroupId ?? r.id,
        clientId: r.clientId,
        categorySlug: r.category.slug,
        city: r.city,
        createdAt: r.createdAt,
        firstQuoteAt: r.quotes[0]?.createdAt ?? null,
        deletedByClientAt: r.deletedByClientAt,
        accepted: booking !== null && booking.status !== "CANCELED",
        completed: booking?.status === "COMPLETED",
        reviewed: Boolean(booking?.review),
      };
    });
    const inWindow = requests.filter((r) => r.createdAt >= windowStart);

    const statsRows = proRows.map(({ category, extraCategories, agendaWeekTemplate, _count, ...row }) => ({
      ...row,
      categorySlugs: [category.slug, ...extraCategories.map((c) => c.slug)],
      hasAgenda: agendaWeekTemplate !== null || _count.availabilitySlots > 0,
      servicesCount: _count.services,
      quotesCount: _count.quotes,
      bookingsCount: _count.bookings,
    }));
    const visible = statsRows.filter((row) => professionalStatusOf(row, now) === "VISIBLE");

    // Numero guida.
    const guideRows = inWindow.map((r) => guideOutcome(r, now)).filter((o) => o !== null);
    const guide = { requests: guideRows.length, withQuote: guideRows.filter((o) => o === "yes").length };
    const { cells, otherCells } = buildGuideCells(
      inWindow,
      searchDays.map((d) => ({ categorySlug: d.category.slug, city: d.city, emptyCount: d.emptyCount })),
      visible,
      now,
    );
    const guideWeekly = buildGuideWeekly(requests, now, SITE_STATS_WEEKS);

    // Percorso del cliente.
    const steps = new Map<RequestStepKey, number>();
    const stepsFromProfile = new Map<RequestStepKey, number>();
    for (const day of stepDays) {
      const key = day.step as RequestStepKey;
      steps.set(key, (steps.get(key) ?? 0) + (day._sum.count ?? 0));
      if (day.origin === "PROFILE") stepsFromProfile.set(key, (stepsFromProfile.get(key) ?? 0) + (day._sum.count ?? 0));
    }
    const groups = new Map<string, SiteRequestRow[]>();
    for (const r of inWindow) groups.set(r.groupKey, [...(groups.get(r.groupKey) ?? []), r]);
    const groupList = [...groups.values()];
    const funnelCounts: Record<ClientFunnelKey, number> = {
      SEARCHES: searchDays.reduce((s, d) => s + d.count, 0) + (freeSearches._sum.count ?? 0),
      PROFILE_VIEWS: profileViews._sum.count ?? 0,
      REQUEST_STARTED: steps.get("LAVORO") ?? 0,
      REQUEST_SENT: groupList.length,
      WITH_QUOTE: groupList.filter((g) => g.some((r) => guideOutcome(r, now) === "yes")).length,
      ACCEPTED: groupList.filter((g) => g.some((r) => r.accepted)).length,
      COMPLETED: groupList.filter((g) => g.some((r) => r.completed)).length,
      REVIEWED: groupList.filter((g) => g.some((r) => r.reviewed)).length,
    };

    // Coorti.
    const firstRequests = await this.prisma.guidedRequest.groupBy({
      by: ["clientId"],
      where: { hiddenAt: null, ...notAdmin, ...launchOn },
      _min: { createdAt: true },
      having: { createdAt: { _min: { gte: fromLaunch(cohortStart) } } },
    });
    const firstRequestAt = new Map(firstRequests.flatMap((f) => (f._min.createdAt ? [[f.clientId, f._min.createdAt] as const] : [])));
    const cohortPros = statsRows.filter((p) => p.createdAt >= cohortStart);
    const cohortIds = cohortPros.map((p) => p.id);
    const visibleIds = visible.map((p) => p.id);
    const proAnswer = { actor: "PROFESSIONAL" as const, automatic: false };
    const [firstQuotes, activeQuotes, activeMessages, recentLeads] = await Promise.all([
      cohortIds.length ? this.prisma.quote.groupBy({ by: ["professionalProfileId"], where: { professionalProfileId: { in: cohortIds }, ...launchOn }, _min: { createdAt: true } }) : [],
      this.prisma.quote.groupBy({ by: ["professionalProfileId"], where: { createdAt: { gte: since30 }, professionalProfile: proCounted } }),
      this.prisma.conversationEvent.groupBy({ by: ["professionalProfileId"], where: { ...proAnswer, createdAt: { gte: since30 }, professionalProfile: proCounted } }),
      visibleIds.length
        ? this.prisma.lead.findMany({ where: { createdAt: { gte: since14 }, professionalProfileId: { in: visibleIds } }, select: { guidedRequestId: true, professionalProfileId: true, status: true } })
        : [],
    ]);
    const firstQuoteBy = new Map(firstQuotes.map((q) => [q.professionalProfileId, q._min.createdAt]));
    const activeIds = new Set([...activeQuotes, ...activeMessages].map((r) => r.professionalProfileId));
    const professionalCohorts = buildProfessionalCohorts(
      cohortPros.map((p) => ({
        createdAt: p.createdAt,
        fiscalDone: Boolean(p.fiscalProfile?.fiscalDataCompleteAt),
        identityDone: p.verified,
        firstQuoteAt: firstQuoteBy.get(p.id) ?? null,
        activeLast30d: activeIds.has(p.id),
      })),
      now,
      SITE_COHORT_WEEKS,
    );

    // Professionisti che non rispondono: almeno 3 richieste in 14 giorni, nessuna risposta.
    const leadRequestIds = [...new Set(recentLeads.map((l) => l.guidedRequestId))];
    const [leadQuotes, leadMessages] = leadRequestIds.length
      ? await Promise.all([
          this.prisma.quote.findMany({ where: { guidedRequestId: { in: leadRequestIds } }, select: { guidedRequestId: true, professionalProfileId: true } }),
          this.prisma.conversationEvent.findMany({ where: { ...proAnswer, guidedRequestId: { in: leadRequestIds } }, select: { guidedRequestId: true, professionalProfileId: true }, distinct: ["guidedRequestId", "professionalProfileId"] }),
        ])
      : [[], []];
    const answered = new Set([...leadQuotes, ...leadMessages].map((a) => `${a.guidedRequestId}|${a.professionalProfileId}`));
    const leadsByPro = new Map<string, { total: number; answered: number }>();
    for (const lead of recentLeads) {
      const row = leadsByPro.get(lead.professionalProfileId) ?? { total: 0, answered: 0 };
      row.total += 1;
      if (lead.status === "DECLINED" || answered.has(`${lead.guidedRequestId}|${lead.professionalProfileId}`)) row.answered += 1;
      leadsByPro.set(lead.professionalProfileId, row);
    }
    const proName = (p: (typeof statsRows)[number]) => p.businessName?.trim() || [p.user.name, p.user.surname].filter(Boolean).join(" ") || p.user.email || "Professionista";
    const userHref = (p: (typeof statsRows)[number]) => `/admin/utenti?q=${encodeURIComponent(p.user.email ?? p.businessName ?? "")}`;
    const silent = visible
      .filter((p) => {
        const leads = leadsByPro.get(p.id);
        return leads && leads.total >= 3 && leads.answered === 0;
      })
      .map((p) => ({ name: proName(p), requests: leadsByPro.get(p.id)!.total, href: userHref(p) }));

    // Professionisti fermi a metà iscrizione: iscritti da 7 a 60 giorni, non ancora visibili.
    const needsIdentity = identityVerificationRequired();
    const stalled = statsRows
      .filter((p) => {
        const age = now.getTime() - p.createdAt.getTime();
        return age >= 7 * DAY_MS && age <= 60 * DAY_MS && !p.invitePendingAt && !p.suspendedAt && !p.user.suspendedAt;
      })
      .flatMap((p): StalledProfessional[] => {
        const days = Math.floor((now.getTime() - p.createdAt.getTime()) / DAY_MS);
        if (!p.fiscalProfile?.fiscalDataCompleteAt) return [{ name: proName(p), step: "FISCAL", days, href: userHref(p) }];
        if (needsIdentity && !p.verified) return [{ name: proName(p), step: "IDENTITY", days, href: userHref(p) }];
        return [];
      });

    // Invii non riusciti, parole cercate, provenienza, motivi.
    const sumFailures = (since: Date) => {
      const map = new Map<string, number>();
      for (const f of failureDays) if (f.day >= since) map.set(`${f.form}|${f.kind}`, (map.get(`${f.form}|${f.kind}`) ?? 0) + f.count);
      return SUBMIT_FORM_KEYS.flatMap((form) =>
        SUBMIT_FAILURE_KINDS.flatMap((kind) => {
          const count = map.get(`${form}|${kind}`) ?? 0;
          return count ? [{ form: form as SubmitFormKey, kind: kind as SubmitFailureKind, count }] : [];
        }),
      );
    };
    const termByHash = new Map(terms.map((t) => [t.termHash, t.term]));
    const unknownJobs = termDays
      .flatMap((d) => {
        const term = termByHash.get(d.termHash);
        return term ? [{ term, days: d._count._all, searches: d._sum.count ?? 0 }] : [];
      })
      .sort((a, b) => b.days - a.days || b.searches - a.searches || a.term.localeCompare(b.term, "it"))
      .slice(0, 20);
    const serviceList: SiteServiceRow[] = serviceRows.map((r) => ({
      profileId: r.professionalProfileId,
      name: r.name,
      categorySlugs: [r.professionalProfile.category.slug, ...r.professionalProfile.extraCategories.map((c) => c.slug)],
    }));
    const popularServices = buildPopularServices(
      serviceSearches.map((r) => ({ categorySlug: r.categorySlug, service: r.service, searches: r._sum.count ?? 0 })),
      serviceList,
    );
    const standardRows = await this.prisma.standardServiceName.findMany({ select: { categorySlug: true, name: true } });
    const standardByCategory: Record<string, string[]> = {};
    for (const row of standardRows) (standardByCategory[row.categorySlug] ??= []).push(row.name);
    const missingServices = buildMissingServices(serviceList, standardByCategory);
    const sources = new Map<SignupSourceKey, number>();
    for (const u of signups) {
      const key: SignupSourceKey = u._count.profileInvites > 0 ? "INVITE" : (u.signupSource ?? "unknown");
      sources.set(key, (sources.get(key) ?? 0) + 1);
    }
    const signupSources = (["INVITE", ...TRAFFIC_SOURCES, "unknown"] as SignupSourceKey[]).map((source) => ({ source, count: sources.get(source) ?? 0 }));
    const churnReasons = churnDays
      .filter((c) => (CHURN_KINDS as readonly string[]).includes(c.kind) && (CHURN_REASONS as readonly string[]).includes(c.reason))
      .map((c) => ({ kind: c.kind as ChurnKind, reason: c.reason as ChurnReason, count: c._sum.count ?? 0 }))
      .sort((a, b) => b.count - a.count);

    // Confronto: richieste inviate contate dal browser contro quelle salvate.
    const firstCounted = await this.prisma.requestStepDay.findFirst({ where: { step: "INVIATA" }, orderBy: { day: "asc" }, select: { day: true } });
    const reconcileFrom = dayFromLaunch(dayStart(new Date(now.getTime() - (RECONCILE_DAYS - 1) * DAY_MS)));
    const reconcileSince = firstCounted && firstCounted.day > reconcileFrom ? firstCounted.day : reconcileFrom;
    const countedSent = firstCounted
      ? ((await this.prisma.requestStepDay.aggregate({ where: { step: "INVIATA", day: { gte: reconcileSince } }, _sum: { count: true } }))._sum.count ?? 0)
      : 0;
    const savedSent = firstCounted ? new Set(requests.filter((r) => r.createdAt >= reconcileSince).map((r) => r.groupKey)).size : 0;
    const reconciliation = reconcile(countedSent, savedSent, Math.round((now.getTime() - reconcileSince.getTime()) / DAY_MS) || 1);

    // Tappa silenziosa e prezzi.
    const launch = launchDate();
    const [clientsWithRequest, acceptedJobs, paidOnline, paying, atLimit30d, trials] = await Promise.all([
      this.prisma.guidedRequest.groupBy({ by: ["clientId"], where: { hiddenAt: null, ...notAdmin, ...launchOn } }).then((g) => g.length),
      this.prisma.booking.count({ where: { quoteId: { not: null }, status: { not: "CANCELED" }, professionalProfile: proCounted, client: COUNTED_USER, ...launchOn } }),
      this.prisma.jobPayment.count({ where: { depositPaidAt: from ? { gte: from } : { not: null }, booking: { client: COUNTED_USER, professionalProfile: proCounted } } }),
      this.prisma.subscription.count({ where: { stripeSubscriptionId: { not: null }, status: "ACTIVE", professionalProfile: proCounted } }),
      this.prisma.professionalProfile.count({ where: { ...proCounted, jobLimitReachedAt: { gte: since30 } } }),
      this.prisma.subscription.findMany({
        where: { trialEndsAt: { gte: new Date(now.getTime() - 60 * DAY_MS), lte: now }, founderNumber: null, professionalProfile: proCounted },
        select: { stripeSubscriptionId: true },
      }),
    ]);
    const launchBase = { visibleProfessionals: visible.length, clientsWithRequest, acceptedJobs, paidOnline, greenWeeks: greenWeeksInARow(guideWeekly) };
    const launchStatus = { ...launchBase, ready: launchReady(launchBase) };
    const requestSteps = REQUEST_STEP_KEYS.map((key) => ({ key, count: steps.get(key) ?? 0, fromProfile: stepsFromProfile.get(key) ?? 0 }));

    const allAdvice = buildSiteAdvice({
      now,
      profileViews: funnelCounts.PROFILE_VIEWS,
      launch,
      cells,
      searchZones: searchDemandZones(searchDays.filter((d) => d.day >= since7Day).map((d) => ({ categorySlug: d.category.slug, city: d.city, count: d.count, emptyCount: d.emptyCount }))),
      requestSteps,
      failures: sumFailures(since7Day),
      unknownJobs,
      popularServices,
      missingServices,
      contacts: visible.map((p) => ({ id: p.id, name: proName(p), city: p.city, href: userHref(p), categorySlugs: p.categorySlugs })),
      services: serviceList,
      churnReasons,
      stalled,
      silent,
      launchStatus,
      reconciliation,
      requestsInWindow: inWindow.length,
      prices: { paying, atLimit30d, trialsEnded: trials.length, trialsConverted: trials.filter((t) => t.stripeSubscriptionId).length },
    });
    // Consigli segnati come fatti: fuori per SITE_ADVICE_DONE_DAYS giorni, anche dall'email del lunedì.
    const doneRows = await this.prisma.siteAdviceDone.findMany({ where: { doneAt: { gte: new Date(now.getTime() - SITE_ADVICE_DONE_DAYS * DAY_MS) } }, orderBy: { doneAt: "desc" } });
    const doneKeys = new Set(doneRows.map((d) => d.key));
    const advice = allAdvice.filter((a) => !doneKeys.has(a.key));
    const doneAdvice = doneRows.map((d) => ({
      key: d.key,
      title: d.title,
      doneAt: d.doneAt.toISOString(),
      until: new Date(d.doneAt.getTime() + SITE_ADVICE_DONE_DAYS * DAY_MS).toISOString(),
    }));

    const automaticNotes = [...SITE_AUTOMATIC_NOTES, ...(launch ? [{ day: isoDay(launch), text: "Lancio del sito" }] : [])]
      .filter((n) => n.day >= isoDay(weeksStart))
      .map((n) => ({ id: null, ...n }));

    return {
      windowDays: SITE_STATS_WINDOW_DAYS,
      countingFrom: from?.toISOString() ?? null,
      launchDate: launch?.toISOString() ?? null,
      guide,
      guideWeekly,
      cells,
      otherCells,
      clientFunnel: CLIENT_FUNNEL_KEYS.map((key) => ({ key, count: funnelCounts[key] })),
      requestSteps,
      priceToolSteps: PRICE_TOOL_STEP_KEYS.map((key) => ({ key, count: priceToolDays.find((d) => d.step === key)?._sum.count ?? 0 })),
      clientCohorts: buildClientCohorts(requests, firstRequestAt, now, SITE_COHORT_WEEKS),
      professionalCohorts,
      submitFailures: sumFailures(windowDay),
      unknownJobs,
      popularServices,
      missingServices,
      signupSources,
      churnReasons,
      notes: [...automaticNotes, ...notes.map((n) => ({ id: n.id, day: isoDay(n.day), text: n.text }))].sort((a, b) => a.day.localeCompare(b.day)),
      reconciliation,
      launch: launchStatus,
      advice,
      doneAdvice,
    };
  }

  async addNote(input: SiteNoteInput): Promise<{ id: string }> {
    const note = await this.prisma.siteNote.create({ data: { day: new Date(`${input.day}T00:00:00Z`), text: input.text.trim() } });
    return { id: note.id };
  }

  /** "Fatto" su un consiglio: non torna per SITE_ADVICE_DONE_DAYS giorni; scritto nel registro azioni. */
  async markAdviceDone(adminUserId: string, input: SiteAdviceDoneInput): Promise<void> {
    await this.prisma.siteAdviceDone.upsert({
      where: { key: input.key },
      create: { key: input.key, title: input.title, doneById: adminUserId },
      update: { title: input.title, doneById: adminUserId, doneAt: new Date() },
    });
    await this.auditLogService.record({ entityType: "SiteAdvice", entityId: input.key, fieldName: "adviceDone", newValue: input.title, changedByUserId: adminUserId });
  }

  /** Annulla "Fatto": il consiglio torna subito se i numeri lo dicono ancora. */
  async undoAdviceDone(adminUserId: string, input: SiteAdviceUndoInput): Promise<void> {
    const deleted = await this.prisma.siteAdviceDone.deleteMany({ where: { key: input.key } });
    if (deleted.count === 0) throw new NotFoundException("Consiglio non trovato.");
    await this.auditLogService.record({ entityType: "SiteAdvice", entityId: input.key, fieldName: "adviceDone", newValue: "UNDONE", changedByUserId: adminUserId });
  }

  async deleteNote(id: string): Promise<void> {
    const deleted = await this.prisma.siteNote.deleteMany({ where: { id } });
    if (deleted.count === 0) throw new NotFoundException("Nota non trovata.");
  }

  /**
   * Ogni lunedì alle 9 (ora di Roma), solo dopo il lancio: i consigli della
   * settimana ai super admin, in campanella ed email. Nessun messaggio se
   * non c'è niente da fare. Prende il posto dell'avviso sulle ricerche senza
   * professionisti (§371), che ora è uno dei consigli.
   */
  @Cron("0 9 * * 1", { timeZone: "Europe/Rome" })
  async weeklyAdvice(now: Date = new Date()): Promise<AdminSiteStats["advice"] | null> {
    if (!hasLaunched(now, launchDate())) return null;
    const { advice } = await this.getStats(now);
    if (advice.length === 0) return advice;
    this.logger.log(`Consigli della settimana: ${advice.map((a) => a.key).join(", ")}`);
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    const payload = { advice: advice.map((a) => ({ level: a.level, title: a.title, todo: a.todo })) };
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER")) {
        await this.notificationsService.notify(admin.id, "ADMIN_WEEKLY_ADVICE", payload as never);
      }
    }
    return advice;
  }
}
