import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  DEFAULT_PROBLEM_EXAMPLES,
  describeProblemExample,
  isProfessionalCategorySlug,
  orderProblemExamples,
  type ProblemExample,
  type ProblemExamplesResponse,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CategoriesService } from "../categories/categories.service";
import { PRISMA } from "../prisma/prisma.module";

/** Le frasi cambiano di rado: l'ordine si ricalcola al massimo ogni 10 minuti. */
const CACHE_MS = 10 * 60_000;

/**
 * Frasi d'esempio della ricerca per problema in home (richiesta di Luca,
 * docs/changelog/2026-11-03-luci-che-accelerano.md): l'elenco lo sceglie
 * l'admin in "Mestieri richiesti" (vuoto: quello di partenza), l'ordine lo
 * danno le ricerche e le richieste per mestiere, le stesse che ordinano le
 * categorie della richiesta di preventivo (`CategoriesService.getPopularity`).
 */
@Injectable()
export class ProblemExamplesService {
  private cached: { at: number; value: ProblemExamplesResponse } | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly categoriesService: CategoriesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async texts(): Promise<{ texts: string[]; custom: boolean }> {
    const rows = await this.prisma.problemExample.findMany({ orderBy: { createdAt: "asc" }, select: { text: true } });
    return rows.length > 0 ? { texts: rows.map((row) => row.text), custom: true } : { texts: [...DEFAULT_PROBLEM_EXAMPLES], custom: false };
  }

  async publicExamples(): Promise<ProblemExamplesResponse> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const [{ texts }, popularity] = await Promise.all([this.texts(), this.categoriesService.getPopularity().catch(() => null)]);
    const order = (popularity?.counts ?? [])
      .filter((item) => item.count > 0)
      .map((item) => item.slug)
      .filter((slug): slug is ProfessionalCategorySlug => isProfessionalCategorySlug(slug));
    const value = orderProblemExamples(texts, order);
    this.cached = { at: Date.now(), value };
    return value;
  }

  /** Per l'admin: l'elenco com'è, con il mestiere riconosciuto, nell'ordine in cui compare in home. */
  async adminList(): Promise<{ custom: boolean; examples: ProblemExample[] }> {
    const [{ custom }, ordered] = await Promise.all([this.texts(), this.publicExamples()]);
    return { custom, examples: ordered.examples };
  }

  /** La prima modifica copia l'elenco di partenza nella tabella, poi la applica. */
  private async ensureCustomList(adminUserId: string) {
    const count = await this.prisma.problemExample.count();
    if (count > 0) return;
    await this.prisma.problemExample.createMany({
      data: DEFAULT_PROBLEM_EXAMPLES.map((text) => ({ text, createdById: adminUserId })),
      skipDuplicates: true,
    });
  }

  async add(adminUserId: string, rawText: string) {
    const text = rawText.trim().replace(/\s+/g, " ");
    const display = text.charAt(0).toLocaleUpperCase("it") + text.slice(1);
    const example = describeProblemExample(display);
    if (!example.categorySlug) {
      throw new BadRequestException(
        "Il sito non riconosce questa frase con sicurezza: scegline un'altra o insegna la parola al dizionario qui sopra.",
      );
    }
    await this.ensureCustomList(adminUserId);
    const existing = await this.prisma.problemExample.findMany({ select: { text: true } });
    if (existing.some((row) => row.text.toLocaleLowerCase("it") === display.toLocaleLowerCase("it"))) {
      throw new BadRequestException("La frase c'è già.");
    }
    const saved = await this.prisma.problemExample.create({ data: { text: display, createdById: adminUserId } });
    await this.auditLogService.record({
      entityType: "ProblemExample",
      entityId: saved.id,
      fieldName: "text",
      newValue: { text: display },
      changedByUserId: adminUserId,
    });
    this.cached = null;
    return example;
  }

  async remove(adminUserId: string, text: string) {
    await this.ensureCustomList(adminUserId);
    const existing = await this.prisma.problemExample.findUnique({ where: { text } });
    if (!existing) throw new NotFoundException();
    if ((await this.prisma.problemExample.count()) <= 5) {
      throw new BadRequestException("Servono almeno 5 frasi: aggiungine una prima di togliere questa.");
    }
    await this.prisma.problemExample.delete({ where: { id: existing.id } });
    await this.auditLogService.record({
      entityType: "ProblemExample",
      entityId: existing.id,
      fieldName: "text",
      oldValue: { text },
      changedByUserId: adminUserId,
    });
    this.cached = null;
    return { ok: true as const };
  }
}
