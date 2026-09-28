/**
 * Regole pure dell'abbonamento a livelli (docs/CHANGELOG.md §161), testate
 * in `subscription-rules.test.ts`.
 */
import { USAGE_WARNING_RATIO, subscriptionTierInfo, type MySubscription, type PauseReason, type SubscriptionTier } from "@professionisti/shared";

/** Risposta a chi prova a scrivere o prenotare un professionista in pausa. */
export const NOT_ACCEPTING_REQUESTS = "Questo professionista al momento non accetta nuove richieste. Cerca altri professionisti nella tua zona.";

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
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date | null;
};

export function subscriptionState(row: SubscriptionRow | null, now: Date): MySubscription["state"] {
  if (!row || row.status === "TRIALING") {
    return row?.trialEndsAt && row.trialEndsAt.getTime() > now.getTime() ? "TRIAL" : "TRIAL_ENDED";
  }
  if (row.status === "CANCELED") return "CANCELED";
  // Annullato con giorni ancora pagati: attivo fino alla scadenza. Rete di
  // sicurezza se il webhook di fine abbonamento di Stripe tardasse.
  if (row.cancelAtPeriodEnd && row.currentPeriodEnd && row.currentPeriodEnd.getTime() <= now.getTime()) return "CANCELED";
  // Una riga attiva senza livello (vecchio piano gratuito) vale come prova finita.
  if (!tierOfPlan(row.plan)) return "TRIAL_ENDED";
  if (row.status === "PAST_DUE") return "PAST_DUE";
  return "ACTIVE";
}

/**
 * Limite mensile di lavori accettati. Il mese gratuito vale come il livello
 * Base (decisione dell'utente, docs/CHANGELOG.md §162); Pro senza limite.
 */
export function monthlyLimit(row: SubscriptionRow | null, now: Date): number | null {
  const state = subscriptionState(row, now);
  if (state === "TRIAL") return subscriptionTierInfo("BASE").monthlyAcceptedJobs;
  if (state !== "ACTIVE" && state !== "PAST_DUE") return null;
  const tier = row ? tierOfPlan(row.plan) : null;
  return tier ? subscriptionTierInfo(tier).monthlyAcceptedJobs : null;
}

/**
 * Perché l'account è in pausa (fuori dalla ricerca, niente nuove richieste),
 * o null se è operativo. Decisione dell'utente, docs/CHANGELOG.md §162: prova
 * finita senza livello, abbonamento concluso, o lavori del mese esauriti. Un
 * pagamento non riuscito non mette in pausa: Stripe riprova per qualche
 * giorno e, se non va, chiude l'abbonamento.
 */
export function pauseReason(row: SubscriptionRow | null, acceptedJobsThisMonth: number, now: Date): PauseReason | null {
  const state = subscriptionState(row, now);
  if (state === "TRIAL_ENDED") return "TRIAL_ENDED";
  if (state === "CANCELED") return "SUBSCRIPTION_ENDED";
  const limit = monthlyLimit(row, now);
  if (limit !== null && acceptedJobsThisMonth >= limit) return "LIMIT_REACHED";
  return null;
}

/**
 * Quale avviso di scadenza mandare: "RENEWING" pochi giorni prima del
 * rinnovo automatico, "ENDING" se l'abbonamento è stato annullato. Una
 * volta sola per scadenza (`noticeFor` = scadenza già avvisata).
 */
export function periodNoticeToSend(
  row: SubscriptionRow & { noticeFor?: Date | null },
  now: Date,
  noticeDays: number,
): "RENEWING" | "ENDING" | null {
  const state = subscriptionState(row, now);
  if (state !== "ACTIVE" && state !== "PAST_DUE") return null;
  const end = row.currentPeriodEnd;
  if (!end || end.getTime() <= now.getTime()) return null;
  if (end.getTime() - now.getTime() > noticeDays * 24 * 60 * 60 * 1000) return null;
  if (row.noticeFor && row.noticeFor.getTime() === end.getTime()) return null;
  return row.cancelAtPeriodEnd ? "ENDING" : "RENEWING";
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
