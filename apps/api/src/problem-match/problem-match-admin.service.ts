import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  ALL_SUGGESTED_SERVICES,
  OUT_OF_SERVICE_LABELS,
  POPULAR_SERVICES,
  PROFESSIONAL_CATEGORIES,
  isProfessionalCategorySlug,
  normalizeProblemText,
  serviceNameKey,
  type AddStandardServiceInput,
  type ServiceNamesAdminOverview,
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
 * (docs/CHANGELOG.md §392, richieste di Luca).
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
    const sorted = (map: Map<string, number>) =>
      [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

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
    if (Boolean(categorySlug) === Boolean(outOfService))
      throw new BadRequestException("Scegli un mestiere oppure un lavoro fuori servizio.");
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
    await this.auditLogService.record({
      entityType: "ProblemWord",
      entityId: id,
      fieldName: "word",
      oldValue: existing.word,
      changedByUserId: adminUserId,
    });
    this.problemMatchService.forgetTaughtWords();
    return { ok: true as const };
  }

  /**
   * "Prestazioni per mestiere" (§388, richiesta di Luca): per ogni mestiere le
   * prestazioni standard (le nostre e quelle aggiunte dall'admin) e quelle
   * scritte a mano dai professionisti, ognuna con quanti la usano.
   */
  async handwrittenServices(): Promise<ServiceNamesAdminOverview> {
    const [services, aliases, standard, canonical] = await Promise.all([
      this.prisma.professionalService.findMany({
        where: { professionalProfile: { isDemo: false, deletedAt: null } },
        select: {
          name: true,
          professionalProfileId: true,
          professionalProfile: { select: { category: { select: { slug: true } }, extraCategories: { select: { slug: true } } } },
        },
      }),
      this.prisma.serviceNameAlias.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.standardServiceName.findMany({ orderBy: { createdAt: "asc" } }),
      this.serviceNamesService.canonicalizer(),
    ]);

    type Group = { name: string; variants: Set<string>; professionals: Set<string> };
    // Per mestiere: nome (chiave) → chi lo usa. Una prestazione conta in tutti i mestieri del professionista.
    const usage = new Map<string, Map<string, Group>>();
    for (const service of services) {
      const name = canonical(service.name);
      if (!name) continue;
      const key = serviceNameKey(name);
      const profile = service.professionalProfile;
      for (const slug of new Set([profile.category.slug, ...profile.extraCategories.map((c) => c.slug)])) {
        const byName = usage.get(slug) ?? new Map<string, Group>();
        const group = byName.get(key) ?? { name, variants: new Set<string>(), professionals: new Set<string>() };
        group.variants.add(service.name.trim());
        group.professionals.add(service.professionalProfileId);
        byName.set(key, group);
        usage.set(slug, byName);
      }
    }

    const categories = PROFESSIONAL_CATEGORIES.map((category) => {
      const byName = usage.get(category.slug) ?? new Map<string, Group>();
      const added = standard.filter((row) => row.categorySlug === category.slug);
      const standardRows = [
        ...POPULAR_SERVICES[category.slug].map((name) => ({ name, id: null as string | null })),
        ...added.map((row) => ({ name: row.name, id: row.id as string | null })),
      ].map((row) => ({ ...row, professionalCount: byName.get(serviceNameKey(row.name))?.professionals.size ?? 0 }));
      const standardKeys = new Set(standardRows.map((row) => serviceNameKey(row.name)));
      const handwritten = [...byName.entries()]
        .filter(([key]) => !standardKeys.has(key))
        .map(([, group]) => ({ name: group.name, variants: [...group.variants], professionalCount: group.professionals.size }))
        .sort((a, b) => b.professionalCount - a.professionalCount || a.name.localeCompare(b.name, "it"));
      return { slug: category.slug, label: category.label, standard: standardRows, handwritten };
    });

    return {
      minProfessionals: HANDWRITTEN_SUGGEST_MIN,
      suggested: [...new Set([...ALL_SUGGESTED_SERVICES, ...standard.map((row) => row.name)])].sort((a, b) => a.localeCompare(b, "it")),
      categories,
      aliases: aliases.map((row) => ({ key: row.key, canonical: row.canonical })),
    };
  }

  /** "Aggiungi alle standard" (§388): il nome compare tra le prestazioni suggerite della categoria. */
  async addStandardService(adminUserId: string, input: AddStandardServiceInput) {
    if (!isProfessionalCategorySlug(input.categorySlug)) throw new BadRequestException("Categoria sconosciuta.");
    const name = input.name.trim().replace(/\s+/g, " ");
    const displayName = name.charAt(0).toLocaleUpperCase("it") + name.slice(1);
    const key = serviceNameKey(displayName);
    if (!key) throw new BadRequestException("Nome mancante.");
    if (POPULAR_SERVICES[input.categorySlug].some((popular) => serviceNameKey(popular) === key)) {
      throw new BadRequestException("È già tra le prestazioni standard di questa categoria.");
    }
    const existing = await this.prisma.standardServiceName.findMany({
      where: { categorySlug: input.categorySlug },
      select: { name: true },
    });
    if (existing.some((row) => serviceNameKey(row.name) === key))
      throw new BadRequestException("È già tra le prestazioni standard di questa categoria.");
    const saved = await this.prisma.standardServiceName.create({
      data: { categorySlug: input.categorySlug, name: displayName, createdById: adminUserId },
    });
    await this.auditLogService.record({
      entityType: "StandardServiceName",
      entityId: saved.id,
      fieldName: "name",
      newValue: { name: displayName, categorySlug: input.categorySlug },
      changedByUserId: adminUserId,
    });
    this.serviceNamesService.forget();
    return { id: saved.id, categorySlug: saved.categorySlug, name: saved.name };
  }

  async removeStandardService(adminUserId: string, id: string) {
    const existing = await this.prisma.standardServiceName.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.standardServiceName.delete({ where: { id } });
    await this.auditLogService.record({
      entityType: "StandardServiceName",
      entityId: id,
      fieldName: "name",
      oldValue: { name: existing.name, categorySlug: existing.categorySlug },
      changedByUserId: adminUserId,
    });
    this.serviceNamesService.forget();
    return { ok: true as const };
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
    await this.auditLogService.record({
      entityType: "ServiceNameAlias",
      entityId: key,
      fieldName: "canonical",
      oldValue: existing.canonical,
      changedByUserId: adminUserId,
    });
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
