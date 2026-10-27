import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  ALL_SUGGESTED_SERVICES,
  OUT_OF_SERVICE_LABELS,
  isProfessionalCategorySlug,
  normalizeProblemText,
  serviceNameKey,
  type TeachProblemWordInput,
} from "@professionisti/shared";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PRISMA } from "../prisma/prisma.module";
import { ProblemMatchService } from "./problem-match.service";
import { ServiceNamesService } from "./service-names.service";

/** Un nome scritto a mano da almeno tanti professionisti si propone da unire. */
export const HANDWRITTEN_SUGGEST_MIN = 3;

/**
 * Pagine admin "Mestieri richiesti" e "Richieste da seguire"
 * (docs/CHANGELOG.md §387, richieste di Luca).
 */
@Injectable()
export class ProblemMatchAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly problemMatchService: ProblemMatchService,
    private readonly serviceNamesService: ServiceNamesService,
  ) {}

  async overview(filter: "tutte" | "fuori" | "ia" | "nessuno") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const where =
      filter === "fuori"
        ? { outOfService: { not: null } }
        : filter === "ia"
          ? { source: "ia" }
          : filter === "nessuno"
            ? { categories: { isEmpty: true }, outOfService: null }
            : {};
    const [descriptions, lastMonth, words] = await Promise.all([
      this.prisma.problemDescription.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
      this.prisma.problemDescription.findMany({
        where: { createdAt: { gte: since } },
        select: { categories: true, outOfService: true, safety: true, source: true },
      }),
      this.prisma.problemWord.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    const byCategory = new Map<string, number>();
    const byOutOfService = new Map<string, number>();
    let safety = 0;
    let ai = 0;
    let none = 0;
    for (const row of lastMonth) {
      const first = row.categories[0];
      if (first) byCategory.set(first, (byCategory.get(first) ?? 0) + 1);
      if (row.outOfService) byOutOfService.set(row.outOfService, (byOutOfService.get(row.outOfService) ?? 0) + 1);
      if (row.safety) safety += 1;
      if (row.source === "ia") ai += 1;
      if (!first && !row.outOfService) none += 1;
    }
    const sorted = (map: Map<string, number>) => [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

    return {
      lastMonth: { total: lastMonth.length, safety, ai, none, byCategory: sorted(byCategory), byOutOfService: sorted(byOutOfService) },
      descriptions: descriptions.map((row) => ({
        id: row.id,
        text: row.text,
        city: row.city,
        categories: row.categories,
        safety: row.safety,
        outOfService: row.outOfService,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
      })),
      words: words.map((row) => ({ id: row.id, word: row.word, categorySlug: row.categorySlug, outOfService: row.outOfService })),
    };
  }

  async teachWord(adminUserId: string, input: TeachProblemWordInput) {
    const word = normalizeProblemText(input.word).trim();
    if (word.length < 3) throw new BadRequestException("Scrivi almeno 3 lettere.");
    const categorySlug = input.categorySlug && isProfessionalCategorySlug(input.categorySlug) ? input.categorySlug : null;
    const outOfService = input.outOfService && input.outOfService in OUT_OF_SERVICE_LABELS ? input.outOfService : null;
    if (Boolean(categorySlug) === Boolean(outOfService)) throw new BadRequestException("Scegli un mestiere oppure un lavoro fuori servizio.");
    const saved = await this.prisma.problemWord.upsert({
      where: { word },
      create: { word, categorySlug, outOfService, createdById: adminUserId },
      update: { categorySlug, outOfService, createdById: adminUserId },
    });
    await this.auditLogService.record({
      entityType: "ProblemWord",
      entityId: saved.id,
      fieldName: "word",
      newValue: { word, categorySlug, outOfService },
      changedByUserId: adminUserId,
    });
    this.problemMatchService.forgetTaughtWords();
    return { id: saved.id, word, categorySlug, outOfService };
  }

  async forgetWord(adminUserId: string, id: string) {
    const existing = await this.prisma.problemWord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.problemWord.delete({ where: { id } });
    await this.auditLogService.record({ entityType: "ProblemWord", entityId: id, fieldName: "word", oldValue: existing.word, changedByUserId: adminUserId });
    this.problemMatchService.forgetTaughtWords();
    return { ok: true as const };
  }

  /** Nomi delle prestazioni scritti a mano, raggruppati: quelli di almeno 3 professionisti si propongono da unire. */
  async handwrittenServices() {
    const [services, aliases, canonical] = await Promise.all([
      this.prisma.professionalService.findMany({
        where: { professionalProfile: { isDemo: false, deletedAt: null } },
        select: { name: true, professionalProfileId: true },
      }),
      this.prisma.serviceNameAlias.findMany({ orderBy: { createdAt: "desc" } }),
      this.serviceNamesService.canonicalizer(),
    ]);
    const suggested = new Set(ALL_SUGGESTED_SERVICES);
    const groups = new Map<string, { name: string; variants: Set<string>; professionals: Set<string> }>();
    for (const service of services) {
      const name = canonical(service.name);
      if (!name || suggested.has(name)) continue;
      const key = serviceNameKey(name);
      const group = groups.get(key) ?? { name, variants: new Set<string>(), professionals: new Set<string>() };
      group.variants.add(service.name.trim());
      group.professionals.add(service.professionalProfileId);
      groups.set(key, group);
    }
    return {
      minProfessionals: HANDWRITTEN_SUGGEST_MIN,
      suggested: ALL_SUGGESTED_SERVICES,
      names: [...groups.values()]
        .map((group) => ({ name: group.name, variants: [...group.variants], professionalCount: group.professionals.size }))
        .sort((a, b) => b.professionalCount - a.professionalCount || a.name.localeCompare(b.name, "it")),
      aliases: aliases.map((row) => ({ key: row.key, canonical: row.canonical })),
    };
  }

  async mergeServiceName(adminUserId: string, input: { name: string; canonical: string }) {
    const key = serviceNameKey(input.name);
    const canonical = input.canonical.trim();
    if (!key || !canonical) throw new BadRequestException("Nome mancante.");
    if (serviceNameKey(canonical) === key) throw new BadRequestException("È già lo stesso nome.");
    await this.prisma.serviceNameAlias.upsert({
      where: { key },
      create: { key, canonical, createdById: adminUserId },
      update: { canonical, createdById: adminUserId },
    });
    await this.auditLogService.record({
      entityType: "ServiceNameAlias",
      entityId: key,
      fieldName: "canonical",
      newValue: { name: input.name.trim(), canonical },
      changedByUserId: adminUserId,
    });
    this.serviceNamesService.forget();
    return { ok: true as const };
  }

  async removeAlias(adminUserId: string, key: string) {
    const existing = await this.prisma.serviceNameAlias.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException();
    await this.prisma.serviceNameAlias.delete({ where: { key } });
    await this.auditLogService.record({ entityType: "ServiceNameAlias", entityId: key, fieldName: "canonical", oldValue: existing.canonical, changedByUserId: adminUserId });
    this.serviceNamesService.forget();
    return { ok: true as const };
  }

  async takeovers(status: "OPEN" | "DONE") {
    const rows = await this.prisma.problemTakeover.findMany({
      where: { status },
      orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
      take: 200,
      include: { user: { select: { name: true, surname: true, email: true, phone: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      city: row.city,
      outOfService: row.outOfService,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      handledAt: row.handledAt?.toISOString() ?? null,
      client: { name: [row.user.name, row.user.surname].filter(Boolean).join(" ") || null, email: row.user.email, phone: row.user.phone },
    }));
  }

  async markTakeover(adminUserId: string, id: string, status: "OPEN" | "DONE") {
    const existing = await this.prisma.problemTakeover.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.problemTakeover.update({ where: { id }, data: { status, handledAt: status === "DONE" ? new Date() : null } });
    await this.auditLogService.record({
      entityType: "ProblemTakeover",
      entityId: id,
      fieldName: "status",
      oldValue: existing.status,
      newValue: status,
      changedByUserId: adminUserId,
    });
    return { ok: true as const };
  }
}
