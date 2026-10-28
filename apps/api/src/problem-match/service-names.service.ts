import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { canonicalServiceName, serviceNameKey } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

const ALIASES_TTL_MS = 60_000;

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
        orderBy: { createdAt: "asc" },
        select: { categorySlug: true, name: true },
      });
      const byCategory: Record<string, string[]> = {};
      for (const row of rows) (byCategory[row.categorySlug] ??= []).push(row.name);
      this.standard = { byCategory, loadedAt: Date.now() };
    }
    return this.standard.byCategory;
  }

  forget() {
    this.aliases = null;
    this.standard = null;
  }
}
