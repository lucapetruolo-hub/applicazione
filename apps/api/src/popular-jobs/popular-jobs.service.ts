import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  DEFAULT_POPULAR_JOBS,
  POPULAR_JOBS_MAX,
  POPULAR_JOBS_MIN,
  buildPopularJobsAdminView,
  isListedPopularJob,
  orderPopularJobs,
  type PopularJob,
  type PopularJobsAdminView,
  type PopularJobsResponse,
} from "@professionisti/shared";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PRISMA } from "../prisma/prisma.module";
import { countingFrom, daySinceLaunch } from "../site-counts/counted";

/** Le ricerche degli ultimi 90 giorni; l'ordine si ricalcola al massimo ogni 10 minuti. */
const WINDOW_DAYS = 90;
const CACHE_MS = 10 * 60_000;

/**
 * "Lavori più cercati" in home (docs/changelog/2026-11-07-lavori-piu-cercati-home.md,
 * richiesta di Luca): l'elenco lo sceglie l'admin in "Mestieri richiesti" (vuoto:
 * quello di partenza), l'ordine lo danno le ricerche dei lavori sul sito
 * (`ServiceSearchDay`, solo contatori per giorno, dal lancio). Le pillole della
 * home aprono `/cerca?servizio=`, che non si conta tra queste ricerche: un
 * lavoro non resta primo solo perché sta in alto.
 */
@Injectable()
export class PopularJobsService {
  private cached: { at: number; value: PopularJobsResponse } | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async list(): Promise<{ jobs: PopularJob[]; custom: boolean }> {
    const rows = await this.prisma.popularJob.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { service: true, categorySlug: true } });
    const jobs = rows.filter(isListedPopularJob);
    // Un nome tolto dall'elenco suggerito non deve svuotare la home.
    return rows.length > 0 && jobs.length > 0 ? { jobs, custom: true } : { jobs: [...DEFAULT_POPULAR_JOBS], custom: false };
  }

  private async searches(now: Date) {
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    since.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.serviceSearchDay.groupBy({
      by: ["categorySlug", "service"],
      where: { day: { gte: daySinceLaunch(since, countingFrom(now)) } },
      _sum: { count: true },
    });
    return rows.map((row) => ({ categorySlug: row.categorySlug, service: row.service, searches: row._sum.count ?? 0 }));
  }

  async publicJobs(now: Date = new Date()): Promise<PopularJobsResponse> {
    if (this.cached && now.getTime() - this.cached.at < CACHE_MS) return this.cached.value;
    const [{ jobs }, searches] = await Promise.all([this.list(), this.searches(now)]);
    const value = orderPopularJobs(jobs, searches);
    this.cached = { at: now.getTime(), value };
    return value;
  }

  async adminView(now: Date = new Date()): Promise<PopularJobsAdminView> {
    const [{ jobs, custom }, searches] = await Promise.all([this.list(), this.searches(now)]);
    return buildPopularJobsAdminView(jobs, custom, searches);
  }

  /** La prima modifica copia l'elenco di partenza nella tabella, poi la applica. */
  private async ensureCustomList(adminUserId: string) {
    const { jobs, custom } = await this.list();
    if (custom) return;
    await this.prisma.$transaction([
      this.prisma.popularJob.deleteMany({}),
      this.prisma.popularJob.createMany({
        data: jobs.map((job, position) => ({ service: job.service, categorySlug: job.categorySlug, position, createdById: adminUserId })),
      }),
    ]);
  }

  private async record(adminUserId: string, entityId: string, change: { oldValue?: object; newValue?: object }) {
    await this.auditLogService.record({ entityType: "PopularJob", entityId, fieldName: "service", ...change, changedByUserId: adminUserId });
    this.cached = null;
  }

  async add(adminUserId: string, input: { service: string; categorySlug: string }): Promise<PopularJobsAdminView> {
    const job = { service: input.service.trim(), categorySlug: input.categorySlug.trim() };
    if (!isListedPopularJob(job)) throw new BadRequestException("Scegli un lavoro dall'elenco delle prestazioni del mestiere.");
    await this.ensureCustomList(adminUserId);
    const rows = await this.prisma.popularJob.findMany({ select: { service: true, position: true } });
    if (rows.some((row) => row.service.toLocaleLowerCase("it") === job.service.toLocaleLowerCase("it"))) throw new BadRequestException("Questo lavoro c'è già.");
    if (rows.length >= POPULAR_JOBS_MAX) throw new BadRequestException(`Al massimo ${POPULAR_JOBS_MAX} lavori: togline uno prima di aggiungere questo.`);
    const position = rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;
    const saved = await this.prisma.popularJob.create({ data: { ...job, position, createdById: adminUserId } });
    await this.record(adminUserId, saved.id, { newValue: job });
    return this.adminView();
  }

  async remove(adminUserId: string, service: string): Promise<PopularJobsAdminView> {
    await this.ensureCustomList(adminUserId);
    const existing = await this.prisma.popularJob.findUnique({ where: { service } });
    if (!existing) throw new NotFoundException();
    if ((await this.prisma.popularJob.count()) <= POPULAR_JOBS_MIN) {
      throw new BadRequestException(`Servono almeno ${POPULAR_JOBS_MIN} lavori, quanti ne mostra la home: aggiungine uno prima di togliere questo.`);
    }
    await this.prisma.popularJob.delete({ where: { id: existing.id } });
    await this.record(adminUserId, existing.id, { oldValue: { service: existing.service, categorySlug: existing.categorySlug } });
    return this.adminView();
  }

  /** Su o giù di un posto: conta finché le ricerche sono poche, poi decide a parità di ricerche. */
  async move(adminUserId: string, service: string, direction: "up" | "down"): Promise<PopularJobsAdminView> {
    await this.ensureCustomList(adminUserId);
    const rows = await this.prisma.popularJob.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, service: true } });
    const index = rows.findIndex((row) => row.service === service);
    const moved = rows[index];
    if (!moved) throw new NotFoundException();
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return this.adminView();
    const reordered = rows.filter((_, i) => i !== index);
    reordered.splice(target, 0, moved);
    await this.prisma.$transaction(reordered.map((row, position) => this.prisma.popularJob.update({ where: { id: row.id }, data: { position } })));
    await this.record(adminUserId, moved.id, { oldValue: { position: index }, newValue: { position: target } });
    return this.adminView();
  }
}
