import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { canonicalServiceName, serviceNameKey } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

const ALIASES_TTL_MS = 60_000;

/**
 * Nome con cui contare una prestazione (docs/CHANGELOG.md §387): prima le
 * unioni fatte dall'admin ("Unisci a…" in "Mestieri richiesti"), poi la
 * tabella di `packages/shared/src/serviceNames.ts`. Da usare per sommare le
 * prestazioni uguali nella ricerca e nel "Quanto costa in media".
 */
@Injectable()
export class ServiceNamesService {
  private aliases: { map: Map<string, string>; loadedAt: number } | null = null;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Restituisce una funzione sincrona, così si legge il database una volta per tutta la lista. */
  async canonicalizer(): Promise<(name: string) => string> {
    if (!this.aliases || Date.now() - this.aliases.loadedAt > ALIASES_TTL_MS) {
      const rows = await this.prisma.serviceNameAlias.findMany({ select: { key: true, canonical: true } });
      this.aliases = { map: new Map(rows.map((row) => [row.key, row.canonical])), loadedAt: Date.now() };
    }
    const map = this.aliases.map;
    return (name) => map.get(serviceNameKey(name)) ?? canonicalServiceName(name);
  }

  forget() {
    this.aliases = null;
  }
}
