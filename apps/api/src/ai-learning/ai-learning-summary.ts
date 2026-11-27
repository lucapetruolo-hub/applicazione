import type { PrismaClient } from "@professionisti/database";
import type { AiBankRunView, AiLearningWeekly } from "@professionisti/shared";
import { agreementByMonth, bankWorse, previousMonth } from "./ai-learning";

const DAY_MS = 24 * 60 * 60_000;

/** Le proposte che cambiano il dizionario (ricerche senza risultato, categorie cambiate, parole dell'IA). */
export const DICTIONARY_PROPOSAL_KINDS = ["DICTIONARY_WORD", "DICTIONARY_SERVICE_WORD", "CATEGORY_CHANGE_WORD", "NO_RESULT_WORD"] as const;

const AREA_WORD: Record<string, string> = { RICERCA: "ricerca", ADMIN: "Admin" };

/** Gli ultimi due giri di una parte del banco, dal più recente. */
export async function lastRuns(prisma: PrismaClient, area: string) {
  return prisma.aiBankRun.findMany({ where: { area }, orderBy: { ranAt: "desc" }, take: 2 });
}

/** I giri da mostrare, con "istruzioni nuove" quando l'impronta è cambiata dal giro prima. */
export function runViews(rows: { area: string; ranAt: Date; total: number; correct: number; instructionsHash: string }[]): AiBankRunView[] {
  return rows.map((r, i) => ({
    area: r.area as AiBankRunView["area"],
    ranAt: r.ranAt.toISOString(),
    total: r.total,
    correct: r.correct,
    newInstructions: Boolean(rows[i + 1] && rows[i + 1]!.area === r.area && rows[i + 1]!.instructionsHash !== r.instructionsHash),
  }));
}

/** La prima frase rossa tra le parti del banco, se le istruzioni nuove sbagliano di più. */
export async function worseLine(prisma: PrismaClient): Promise<string | null> {
  for (const area of ["RICERCA", "ADMIN"]) {
    const [last, previous] = await lastRuns(prisma, area);
    const line = bankWorse(AREA_WORD[area] ?? area, last ?? null, previous ?? null);
    if (line) return line;
  }
  return null;
}

/**
 * Il riquadro "Il sito impara" dell'email del lunedì
 * (docs/changelog/2026-11-27-il-sito-impara.md): senza servizi, così lo usa
 * anche l'email di Andamento senza giri tra moduli.
 */
export async function aiLearningWeekly(prisma: PrismaClient, now: Date = new Date()): Promise<AiLearningWeekly> {
  const open = { OR: [{ status: "PENDING" }, { status: "SNOOZED", snoozedUntil: { lte: now } }] };
  const month = previousMonth(now);
  const [y, m] = month.split("-").map(Number) as [number, number];
  // Il mese intero più un giorno per parte: il conto per mese lo fa agreementByMonth con l'ora di Roma.
  const from = new Date(Date.UTC(y, m - 1, 1) - DAY_MS);
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) + DAY_MS);
  const [dictionary, rules, bankNew, ricerca, decided, worse] = await Promise.all([
    prisma.adminProposal.count({ where: { kind: { in: [...DICTIONARY_PROPOSAL_KINDS] }, ...open } }),
    prisma.adminProposal.count({ where: { kind: "AI_RULE", ...open } }),
    prisma.aiBankCase.count({ where: { removedAt: null, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    prisma.aiBankRun.findFirst({ where: { area: "RICERCA" }, orderBy: { ranAt: "desc" } }),
    prisma.adminCaseAdvice.findMany({ where: { adminDecidedAt: { gte: from, lt: to }, agrees: { not: null } }, select: { adminDecidedAt: true, agrees: true } }),
    worseLine(prisma),
  ]);
  const agreement = agreementByMonth(decided, 24).find((a) => a.month === month) ?? null;
  return {
    dictionary,
    rules,
    bankNew,
    bankRun: ricerca ? { correct: ricerca.correct, total: ricerca.total } : null,
    agreement,
    worse,
  };
}
