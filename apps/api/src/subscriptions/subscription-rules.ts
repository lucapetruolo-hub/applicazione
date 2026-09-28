/**
 * Regole pure dell'abbonamento a livelli (docs/CHANGELOG.md §161), testate
 * in `subscription-rules.test.ts`.
 */
import { USAGE_WARNING_RATIO, subscriptionTierInfo, type MySubscription, type SubscriptionTier } from "@professionisti/shared";

const ROME_PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
const ROME_OFFSET = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" });
const MONTH_LABEL = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", month: "long", year: "numeric" });

function romeYearMonth(date: Date): { year: number; month: number } {
  const parts = ROME_PARTS.formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")!.value),
    month: Number(parts.find((p) => p.type === "month")!.value),
  };
}

/** Scarto di Roma da UTC in minuti in quell'istante (+60 d'inverno, +120 d'estate). */
function romeOffsetMinutes(date: Date): number {
  const name = ROME_OFFSET.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 60;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** Mezzanotte del primo giorno del mese corrente, ora italiana, come istante UTC. */
export function romeMonthStart(now: Date): Date {
  const { year, month } = romeYearMonth(now);
  const utcMidnight = new Date(Date.UTC(year, month - 1, 1));
  return new Date(utcMidnight.getTime() - romeOffsetMinutes(utcMidnight) * 60_000);
}

/** Chiave del mese per gli avvisi, es. "2026-09". */
export function romeMonthKey(now: Date): string {
  const { year, month } = romeYearMonth(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function romeMonthLabel(now: Date): string {
  return MONTH_LABEL.format(now);
}

/** Livello pagato da una riga Subscription; BUSINESS (vecchio piano) vale come PRO, FREE come nessuno. */
export function tierOfPlan(plan: string): SubscriptionTier | null {
  if (plan === "BASE" || plan === "PLUS" || plan === "PRO") return plan;
  if (plan === "BUSINESS") return "PRO";
  return null;
}

export type SubscriptionRow = {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
};

export function subscriptionState(row: SubscriptionRow | null, now: Date): MySubscription["state"] {
  if (!row || row.status === "TRIALING") {
    return row?.trialEndsAt && row.trialEndsAt.getTime() > now.getTime() ? "TRIAL" : "TRIAL_ENDED";
  }
  if (row.status === "PAST_DUE") return "PAST_DUE";
  if (row.status === "CANCELED") return "CANCELED";
  return "ACTIVE";
}

/** Limite mensile di lavori accettati: nessuno durante la prova o con il livello Pro. */
export function monthlyLimit(row: SubscriptionRow | null, now: Date): number | null {
  // Chi sceglie un livello durante la prova resta senza limite fino alla fine della prova.
  if (row?.trialEndsAt && row.trialEndsAt.getTime() > now.getTime()) return null;
  const state = subscriptionState(row, now);
  if (state !== "ACTIVE" && state !== "PAST_DUE") return null;
  const tier = row ? tierOfPlan(row.plan) : null;
  return tier ? subscriptionTierInfo(tier).monthlyAcceptedJobs : null;
}

/**
 * Quale avviso mandare dopo un nuovo lavoro accettato: "100" al limite,
 * "80" vicino al limite, null se nessuno o se già mandato questo mese.
 */
export function usageNoticeToSend(used: number, limit: number | null, lastNoticeKey: string | null, monthKey: string): "80" | "100" | null {
  if (limit === null || limit <= 0) return null;
  if (used >= limit) return lastNoticeKey === `${monthKey}:100` ? null : "100";
  if (used >= Math.ceil(limit * USAGE_WARNING_RATIO)) {
    return lastNoticeKey === `${monthKey}:80` || lastNoticeKey === `${monthKey}:100` ? null : "80";
  }
  return null;
}
