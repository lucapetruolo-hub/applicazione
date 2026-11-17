import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { canonicalServiceName, serviceNameKey } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { countingFrom, sinceLaunch } from "../site-counts/counted";

const ALIASES_TTL_MS = 60_000;
/** Prestazioni più cercate: si ricontano ogni dieci minuti. */
const SEARCHED_TTL_MS = 10 * 60_000;
/** Ricerche degli ultimi 90 giorni (mai prima del lancio). */
const SEARCHED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
/** Una prestazione cercata una volta sola non è ancora un segnale. */
export const SEARCHED_MIN_COUNT = 2;
/** Le prime per mestiere: bastano a ordinare le pillole del profilo. */
const SEARCHED_PER_CATEGORY = 12;

/**
 * Nome con cui contare una prestazione (docs/CHANGELOG.md §392): prima le
 * unioni fatte dall'admin ("Unisci a…" in "Mestieri richiesti"), poi la
 * tabella di `packages/shared/src/serviceNames.ts`. Da usare per sommare le
 * prestazioni uguali nella ricerca e nel "Quanto costa in media".
 */
@Injectable()
export class ServiceNamesService {
  private aliases: { map: Map<string, string>; loadedAt: number } | null = null;
  private standard: { byCategory: Record<string, string[]>; loadedAt: number } | null = null;
  private searched: { counts: SearchedCounts; byCategory: Record<string, string[]>; loadedAt: number } | null = null;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Restituisce una funzione sincrona, così si legge il database una volta per tutta la lista. */
  async canonicalizer(): Promise<(name: string) => string> {
    if (!this.aliases || Date.now() - this.aliases.loadedAt > ALIASES_TTL_MS) {
      const [rows, standard] = await Promise.all([
        this.prisma.serviceNameAlias.findMany({ select: { key: true, canonical: true } }),
        this.prisma.standardServiceName.findMany({ select: { name: true } }),
      ]);
      // Un nome aggiunto tra le standard (§388) raccoglie le sue varianti,
      // ma un'unione fatta a mano vince.
      const map = new Map(standard.map((row) => [serviceNameKey(row.name), row.name]));
      for (const row of rows) map.set(row.key, row.canonical);
      this.aliases = { map, loadedAt: Date.now() };
    }
    const map = this.aliases.map;
    return (name) => map.get(serviceNameKey(name)) ?? canonicalServiceName(name);
  }

  /** Prestazioni aggiunte dall'admin tra quelle standard, per categoria (§388). */
  async standardByCategory(): Promise<Record<string, string[]>> {
    if (!this.standard || Date.now() - this.standard.loadedAt > ALIASES_TTL_MS) {
      const rows = await this.prisma.standardServiceName.findMany({
        // Ordine fisso (anche a parità di data): un catalogo uguale tiene valida la cache di Anthropic.
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        select: { categorySlug: true, name: true },
      });
      const byCategory: Record<string, string[]> = {};
      for (const row of rows) (byCategory[row.categorySlug] ??= []).push(row.name);
      this.standard = { byCategory, loadedAt: Date.now() };
    }
    return this.standard.byCategory;
  }

  /**
   * Prestazioni più cercate dai clienti per mestiere, dalla descrizione del
   * problema (`problem_descriptions.service`, primo mestiere proposto), in
   * ordine di ricerche (docs/changelog/2026-11-17-prestazioni-veloci.md).
   * Ordinano le pillole "Più cercati dai clienti" nel profilo. Descrizioni
   * anonime: nessun account da escludere; dal lancio (§395).
   */
  async searchedByCategory(now: Date = new Date()): Promise<Record<string, string[]>> {
    return (await this.loadSearched(now)).byCategory;
  }

  /**
   * Ricerche per mestiere e prestazione (nome del catalogo), stessi 90 giorni:
   * in Admin › Mestieri richiesti accanto al numero di professionisti.
   */
  async searchedCounts(now: Date = new Date()): Promise<SearchedCounts> {
    return (await this.loadSearched(now)).counts;
  }

  private async loadSearched(now: Date) {
    if (this.searched && now.getTime() - this.searched.loadedAt <= SEARCHED_TTL_MS) return this.searched;
    const since = sinceLaunch(new Date(now.getTime() - SEARCHED_WINDOW_MS), countingFrom(now));
    const [rows, canonicalize] = await Promise.all([
      this.prisma.$queryRaw<{ slug: string; service: string; count: bigint }[]>`
        SELECT categories[1] AS slug, service, COUNT(*) AS count
        FROM problem_descriptions
        WHERE service IS NOT NULL AND cardinality(categories) > 0 AND "createdAt" >= ${since}
        GROUP BY 1, 2`,
      this.canonicalizer(),
    ]);
    const counts = countSearchedServices(rows, canonicalize);
    this.searched = { counts, byCategory: rankSearchedServices(counts), loadedAt: now.getTime() };
    return this.searched;
  }

  forget() {
    this.aliases = null;
    this.standard = null;
    this.searched = null;
  }
}

/** Mestiere → nome del catalogo → ricerche. */
export type SearchedCounts = Record<string, Record<string, number>>;

/** Somma le varianti con lo stesso nome del catalogo. */
export function countSearchedServices(rows: readonly { slug: string; service: string; count: bigint | number }[], canonicalize: (name: string) => string): SearchedCounts {
  const counts: SearchedCounts = {};
  for (const row of rows) {
    const bySlug = (counts[row.slug] ??= {});
    const name = canonicalize(row.service);
    bySlug[name] = (bySlug[name] ?? 0) + Number(row.count);
  }
  return counts;
}

/** Per mestiere, le prestazioni più cercate (almeno `SEARCHED_MIN_COUNT` ricerche). */
export function rankSearchedServices(counts: SearchedCounts): Record<string, string[]> {
  const byCategory: Record<string, string[]> = {};
  for (const [slug, bySlug] of Object.entries(counts)) {
    const names = Object.entries(bySlug)
      .filter(([, count]) => count >= SEARCHED_MIN_COUNT)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
      .slice(0, SEARCHED_PER_CATEGORY)
      .map(([name]) => name);
    if (names.length > 0) byCategory[slug] = names;
  }
  return byCategory;
}
