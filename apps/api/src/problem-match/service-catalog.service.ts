import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  buildServiceCatalog,
  isProfessionalCategorySlug,
  serviceCategoryOf,
  serviceNameKey,
  type ProfessionalCategorySlug,
  type ServiceCatalogEntry,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { publicRealProfilesWhere } from "../professionals/searchable-profiles";
import { ServiceNamesService } from "./service-names.service";

/** Il catalogo si ricostruisce al massimo ogni 10 minuti: una prestazione nuova entra presto, il database non si legge a ogni domanda. */
const CATALOG_TTL_MS = 10 * 60_000;
/** Nomi più lunghi di così non sono il nome di una prestazione: restano fuori. */
const NAME_MAX = 60;

/**
 * Nome scritto a mano da un professionista, pulito prima di mandarlo all'IA:
 * niente contatti, link, segni da codice o testi lunghi (chi scrive una
 * prestazione non deve poter dare istruzioni all'IA). Null se non va mandato.
 */
export function cleanHandWrittenServiceName(name: string): string | null {
  const text = name.replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > NAME_MAX) return null;
  if (/[<>{}[\]`@#|\\]|https?:|www\./i.test(text)) return null;
  // Un numero lungo è un telefono o un codice, non il nome di un lavoro.
  if (/\d[\d\s.-]{5,}\d/.test(text)) return null;
  return text;
}

/**
 * Catalogo dei servizi per l'IA della ricerca per problema
 * (docs/changelog/2026-11-06-ia-conosce-i-servizi.md): prestazioni suggerite,
 * standard di Admin e scritte a mano dai professionisti visibili nella
 * ricerca, contate una volta per professionista e unite con le unioni di
 * "Mestieri richiesti". Se il database non risponde resta l'ultimo catalogo
 * o quello delle sole prestazioni suggerite: la ricerca non si ferma mai.
 */
@Injectable()
export class ServiceCatalogService {
  private readonly logger = new Logger(ServiceCatalogService.name);
  private cached: { catalog: ServiceCatalogEntry[]; loadedAt: number } | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly serviceNames: ServiceNamesService,
  ) {}

  async catalog(): Promise<ServiceCatalogEntry[]> {
    if (this.cached && Date.now() - this.cached.loadedAt < CATALOG_TTL_MS) return this.cached.catalog;
    try {
      const [standard, handWritten] = await Promise.all([this.serviceNames.standardByCategory(), this.handWrittenByCategory()]);
      const catalog = buildServiceCatalog({ standard, handWritten });
      this.cached = { catalog, loadedAt: Date.now() };
      return catalog;
    } catch (error) {
      this.logger.warn(`Catalogo dei servizi non letto: resta il precedente. ${String(error)}`);
      return this.cached?.catalog ?? buildServiceCatalog({});
    }
  }

  forget() {
    this.cached = null;
  }

  /** Per ogni mestiere i nomi scritti a mano, dal più usato (numero di professionisti). */
  private async handWrittenByCategory(): Promise<Record<string, string[]>> {
    const [canonicalize, profiles] = await Promise.all([
      this.serviceNames.canonicalizer(),
      this.prisma.professionalProfile.findMany({
        where: publicRealProfilesWhere(),
        select: {
          category: { select: { slug: true } },
          extraCategories: { select: { slug: true } },
          services: { select: { name: true, categorySlug: true } },
        },
      }),
    ]);
    const counts = new Map<string, Map<string, { name: string; profiles: number }>>();
    for (const profile of profiles) {
      const slugs = [profile.category.slug, ...profile.extraCategories.map((category) => category.slug)].filter(
        (slug): slug is ProfessionalCategorySlug => isProfessionalCategorySlug(slug),
      );
      if (slugs.length === 0) continue;
      const counted = new Set<string>();
      for (const service of profile.services) {
        const name = cleanHandWrittenServiceName(canonicalize(service.name));
        const slug = serviceCategoryOf(service, slugs);
        if (!name || !slug) continue;
        const key = serviceNameKey(name);
        if (counted.has(`${slug}:${key}`)) continue;
        counted.add(`${slug}:${key}`);
        const byName = counts.get(slug) ?? new Map<string, { name: string; profiles: number }>();
        const entry = byName.get(key) ?? { name, profiles: 0 };
        entry.profiles += 1;
        byName.set(key, entry);
        counts.set(slug, byName);
      }
    }
    const result: Record<string, string[]> = {};
    for (const [slug, byName] of counts) {
      result[slug] = [...byName.values()]
        .sort((a, b) => b.profiles - a.profiles || a.name.localeCompare(b.name, "it"))
        .map((entry) => entry.name);
    }
    return result;
  }
}
