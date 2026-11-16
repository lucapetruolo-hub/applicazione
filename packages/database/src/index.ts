import { PrismaClient } from "../generated/client";

/**
 * Connessioni al database per ogni copia dell'API
 * (docs/changelog/2026-11-16-traffico-elevato.md). Senza indicarlo Prisma ne
 * apre "core visti × 2 + 1": su Render i core visti possono essere quelli
 * della macchina intera, e con più copie (e due durante un aggiornamento) si
 * rischiava di superare le 100 connessioni del piano. Un valore già scritto
 * in `DATABASE_URL` vince sempre.
 */
export const DEFAULT_CONNECTION_LIMIT = 10;
export const DEFAULT_POOL_TIMEOUT_SECONDS = 20;

export function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", String(DEFAULT_CONNECTION_LIMIT));
  if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", String(DEFAULT_POOL_TIMEOUT_SECONDS));
  return parsed.toString();
}

// Singleton per evitare troppe connessioni in dev (hot reload Next.js/Nest).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = withPoolDefaults(process.env.DATABASE_URL);

export const prisma = globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "../generated/client";
