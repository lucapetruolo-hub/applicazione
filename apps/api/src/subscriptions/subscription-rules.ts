/**
 * Regole pure dell'abbonamento a livelli (docs/CHANGELOG.md §161), testate
 * in `subscription-rules.test.ts`.
 */
import {
  DEFAULT_FREE_MONTHS,
  SUBSCRIPTION_TIERS,
  TRIAL_DAYS,
  freeMonthUpgradeEurCents,
  USAGE_WARNING_RATIO,
  subscriptionTierInfo,
  upgradeFeeEurCents,
  type BillingInterval,
  type MySubscription,
  type PauseReason,
  type SubscriptionTier,
} from "@professionisti/shared";

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
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  founderNumber?: number | null;
  freeMonthsGranted?: number | null;
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
 * Limite di lavori accettati per periodo (un mese dal rinnovo). Il mese
 * gratuito vale come il livello Base (decisione dell'utente,
 * docs/CHANGELOG.md §162); Pro senza limite.
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
 * o null se è operativo: prova finita senza livello o abbonamento concluso
 * (docs/CHANGELOG.md §162). Un pagamento non riuscito non mette in pausa:
 * Stripe riprova per qualche giorno e, se non va, chiude l'abbonamento.
 * I lavori esauriti non mettono più in pausa (decisione dell'utente,
 * docs/CHANGELOG.md §362): vedi `jobLimitReached`.
 */
export function pauseReason(row: SubscriptionRow | null, now: Date): PauseReason | null {
  const state = subscriptionState(row, now);
  if (state === "TRIAL_ENDED") return "TRIAL_ENDED";
  // Mesi gratis senza la carta (decisione di Luca del 29/10/2026,
  // docs/changelog/2026-10-29-offerta-mesi-gratis.md): con la carta la riga
  // diventa un abbonamento Base di Stripe con i giorni gratis davanti.
  if (state === "TRIAL") return "CARD_NEEDED";
  if (state === "CANCELED") return "SUBSCRIPTION_ENDED";
  return null;
}

/**
 * Lavori del periodo esauriti (decisione dell'utente, docs/CHANGELOG.md
 * §362): il profilo resta nella ricerca e riceve le richieste, ma non può
 * mandare preventivi nuovi né la prima risposta a una richiesta, né essere
 * prenotato direttamente (l'agenda resta visibile per le richieste, §363).
 * Solo con un abbonamento in corso (prova o livello).
 */
export function jobLimitReached(row: SubscriptionRow | null, used: number, now: Date): boolean {
  if (pauseReason(row, now)) return false;
  const limit = monthlyLimit(row, now);
  return limit !== null && used >= limit;
}

/** Messaggio per chi prova a mandare un preventivo o a rispondere con i lavori esauriti (in shared: il sito lo riconosce). */
export { JOB_LIMIT_REACHED_MESSAGE } from "@professionisti/shared";

/**
 * Risposta a chi prova a prenotare direttamente (solo API, il sito passa
 * sempre da una richiesta) un professionista con i lavori esauriti: niente
 * frasi che lo facciano sembrare non disponibile (decisione dell'utente, §363).
 */
export const NOT_BOOKABLE_ONLINE = "Per questo orario manda una richiesta di preventivo al professionista.";

/**
 * Su Plus e Pro lo stesso cliente conta una volta per periodo (decisione
 * dell'utente, §362); su Base e nel periodo gratuito conta ogni lavoro.
 */
export function countsClientsOnce(row: SubscriptionRow | null, now: Date): boolean {
  const state = subscriptionState(row, now);
  if (state !== "ACTIVE" && state !== "PAST_DUE") return false;
  const tier = row ? tierOfPlan(row.plan) : null;
  return tier === "PLUS" || tier === "PRO";
}

function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Stessa ora e stesso giorno del mese `months` mesi dopo; il 31 diventa l'ultimo giorno dei mesi più corti, come fa Stripe. */
export function addMonthsUtc(date: Date, months: number): Date {
  const total = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(year, month));
  return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

/**
 * Periodo in cui si contano i lavori (decisione dell'utente del 26/10/2026,
 * docs/CHANGELOG.md §362): i lavori ripartono al rinnovo, non il 1° del mese,
 * così lavori, livello e quota di passaggio seguono la stessa data.
 * - Periodo gratuito: blocchi di 30 giorni che finiscono alla fine della
 *   prova (con il mese regalato sono due).
 * - Abbonamento pagato: un mese alla volta dall'inizio del periodo di Stripe
 *   (con l'annuale, ogni mese dalla data dell'abbonamento).
 * - Altrimenti (prova finita, abbonamento concluso, dati mancanti): il mese
 *   di calendario.
 */
export function usagePeriod(row: SubscriptionRow | null, now: Date): { start: Date; end: Date } {
  const t = now.getTime();
  if (row?.trialEndsAt && row.trialEndsAt.getTime() > t && row.status !== "CANCELED") {
    const end = row.trialEndsAt.getTime();
    const blocks = Math.max(1, Math.ceil((end - t) / FREE_PERIOD_MS));
    const start = end - blocks * FREE_PERIOD_MS;
    return { start: new Date(start), end: new Date(start + FREE_PERIOD_MS) };
  }
  const state = subscriptionState(row, now);
  const anchor = row?.currentPeriodStart ?? null;
  if ((state === "ACTIVE" || state === "PAST_DUE") && anchor && anchor.getTime() <= t) {
    let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
    while (months > 0 && addMonthsUtc(anchor, months).getTime() > t) months--;
    while (addMonthsUtc(anchor, months + 1).getTime() <= t) months++;
    return { start: addMonthsUtc(anchor, months), end: addMonthsUtc(anchor, months + 1) };
  }
  const start = romeMonthStart(now);
  return { start, end: romeMonthStart(new Date(start.getTime() + 32 * TRIAL_DAY_MS)) };
}

/** Chiave del periodo per gli avvisi del limite, es. "2026-10-18". */
export function usagePeriodKey(period: { start: Date }): string {
  return period.start.toISOString().slice(0, 10);
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
 * "80" vicino al limite, null se nessuno o se già mandato in questo periodo.
 */
export function usageNoticeToSend(used: number, limit: number | null, lastNoticeKey: string | null, periodKey: string): "80" | "100" | null {
  if (limit === null || limit <= 0) return null;
  if (used >= limit) return lastNoticeKey === `${periodKey}:100` ? null : "100";
  if (used >= Math.ceil(limit * USAGE_WARNING_RATIO)) {
    return lastNoticeKey === `${periodKey}:80` || lastNoticeKey === `${periodKey}:100` ? null : "80";
  }
  return null;
}

const TRIAL_DAY_MS = 24 * 60 * 60 * 1000;

/** Un periodo gratuito (mese di prova o mese regalato): base del calcolo della quota di passaggio. */
export const FREE_PERIOD_MS = TRIAL_DAYS * TRIAL_DAY_MS;

/**
 * Data di lancio del sito (variabile `LAUNCH_DATE` su Render, formato
 * AAAA-MM-GG, mezzanotte ora solare italiana), docs/CHANGELOG.md §170: il mese
 * gratuito parte da lì, non dall'iscrizione, così chi viene reclutato prima
 * del lancio non arriva al lancio con la prova già finita. Null se non
 * impostata o scritta male.
 */
export function launchDate(value: string | undefined = process.env.LAUNCH_DATE): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00+01:00`) : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Il sito è lanciato? Senza data di lancio no: niente pause e niente avvisi di fine prova. */
export function hasLaunched(now: Date, launch: Date | null): boolean {
  return !!launch && now.getTime() >= launch.getTime();
}

/**
 * Fine del periodo gratuito per chi si iscrive adesso: dal lancio, o da oggi
 * se il lancio è passato, per i giorni dei mesi gratis dell'offerta.
 */
export function trialEndFor(now: Date, launch: Date | null, days: number = TRIAL_DAYS): Date {
  const start = launch && launch.getTime() > now.getTime() ? launch : now;
  return new Date(start.getTime() + days * TRIAL_DAY_MS);
}

/**
 * Mesi gratis del giro in corso (docs/changelog/2026-10-29-offerta-mesi-gratis.md):
 * quelli dati dall'offerta all'iscrizione o, dopo un ritorno a Base, quelli
 * ripresi dall'attesa. Le righe di prima dell'offerta valgono 3 mesi.
 */
export function freeMonthsOf(row: { freeMonthsGranted?: number | null } | null): number {
  return row?.freeMonthsGranted ?? DEFAULT_FREE_MONTHS;
}

/** Giorni gratis di una riga: mesi da 30 giorni. */
export function trialDaysOf(row: { freeMonthsGranted?: number | null } | null): number {
  return freeMonthsOf(row) * TRIAL_DAYS;
}

/**
 * Caselle dei mesi gratis in Abbonamento: `currentMonth` è il mese in corso
 * (1-N), 0 se non sono ancora partiti (prima del lancio), null quando sono
 * finiti o interrotti. Null senza mesi gratis.
 */
export function freeMonthsProgress(months: number, trialEndsAt: Date | null, now: Date): MySubscription["freeMonths"] {
  if (months <= 0) return null;
  if (!trialEndsAt) return { months, currentMonth: 0 };
  const end = trialEndsAt.getTime();
  const start = end - months * FREE_PERIOD_MS;
  const t = now.getTime();
  if (t >= end) return { months, currentMonth: null };
  if (t < start) return { months, currentMonth: 0 };
  return { months, currentMonth: Math.min(months, Math.floor((t - start) / FREE_PERIOD_MS) + 1) };
}

/**
 * Mesi gratis che restano dopo quello in corso, quando si passa a Plus o Pro
 * (decisione di Luca: "li avrà sempre i 3 mesi gratis meno la sottoscrizione
 * già usata"): il mese iniziato conta come usato. Prima che i mesi partano
 * restano tutti.
 */
export function freeMonthsLeftAfterCurrent(months: number, trialEndsAt: Date | null, now: Date): number {
  if (!trialEndsAt || months <= 0) return 0;
  const remaining = trialEndsAt.getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.min(months, Math.floor(remaining / FREE_PERIOD_MS));
}

const MONTH_FALLBACK_MS = 30 * TRIAL_DAY_MS;
const YEAR_FALLBACK_MS = 365 * TRIAL_DAY_MS;

/**
 * Quanto costa passare a ogni livello sopra quello attuale. Nei mesi gratis
 * (con o senza carta) il mese del nuovo livello meno Base, e parte un mese
 * nuovo (decisione di Luca del 29/10/2026); prima del lancio non si passa,
 * perché non c'è limite di lavori. Con un abbonamento pagato la quota di
 * passaggio fino al rinnovo (docs/CHANGELOG.md §361).
 */
export function upgradeQuotes(input: {
  state: MySubscription["state"];
  tier: SubscriptionTier | null;
  interval: BillingInterval;
  waitingLaunch: boolean;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  now: Date;
}): MySubscription["upgradeQuotes"] {
  const paid = input.state === "ACTIVE" || input.state === "PAST_DUE";
  if (!paid && input.state !== "TRIAL") return [];
  if (input.waitingLaunch) return [];
  const freeMonthsRunning = input.trialEndsAt !== null && input.trialEndsAt.getTime() > input.now.getTime();
  const from: SubscriptionTier = paid && input.tier ? input.tier : "BASE";
  const higher = SUBSCRIPTION_TIERS.slice(SUBSCRIPTION_TIERS.findIndex((t) => t.tier === from) + 1);
  return higher.map(({ tier }) => {
    if (freeMonthsRunning) return { tier, amountEurCents: freeMonthUpgradeEurCents(tier), until: null };
    const end = input.currentPeriodEnd;
    if (!paid || !end) return { tier, amountEurCents: 0, until: null };
    const periodMs = input.currentPeriodStart ? end.getTime() - input.currentPeriodStart.getTime() : input.interval === "YEAR" ? YEAR_FALLBACK_MS : MONTH_FALLBACK_MS;
    return {
      tier,
      amountEurCents: upgradeFeeEurCents({ from, to: tier, interval: input.interval, remainingMs: end.getTime() - input.now.getTime(), periodMs }),
      until: end.toISOString(),
    };
  });
}
