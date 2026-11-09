/**
 * Lavori ricorrenti (funzione nuova 3 del controllo pre-lancio dell'08/11/2026,
 * docs/changelog/2026-11-09-lavori-ricorrenti.md): il professionista propone
 * nel preventivo "Ogni settimana", "Ogni 2 settimane" o "Ogni mese", il
 * cliente accetta una volta sola e le visite successive entrano in agenda da
 * sole, ognuna un lavoro a sé (promemoria, "Lavoro terminato", pagamento), con
 * "Salta questa volta" e "Interrompi".
 *
 * Date come nel resto dell'agenda: ora italiana scritta come UTC, quindi i
 * conti si fanno sui campi UTC senza fusi.
 */

export const RECURRING_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: "Ogni settimana",
  BIWEEKLY: "Ogni 2 settimane",
  MONTHLY: "Ogni mese",
};

/** Mestieri che lavorano a visite ripetute: solo per questi il preventivo offre la scelta. */
export const RECURRING_CATEGORY_SLUGS = ["pulizie", "giardiniere", "babysitter", "dogsitter"] as const;

export function recurringAllowedForCategory(slug: string | null | undefined): boolean {
  return !!slug && (RECURRING_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return typeof value === "string" && (RECURRING_FREQUENCIES as readonly string[]).includes(value);
}

/** Visite già in agenda in anticipo: quelle dei prossimi 28 giorni, e almeno la prossima. */
export const RECURRING_HORIZON_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Data della visita numero `number` (1 = la prima, quella del preventivo).
 * Ogni mese: stesso giorno del mese della prima visita, o l'ultimo del mese
 * se quel giorno non c'è (31 → 30 aprile, 28 o 29 febbraio).
 */
export function recurringVisitDate(first: Date, frequency: RecurringFrequency, number: number): Date {
  const step = Math.max(0, Math.floor(number) - 1);
  if (frequency === "WEEKLY") return new Date(first.getTime() + step * 7 * DAY_MS);
  if (frequency === "BIWEEKLY") return new Date(first.getTime() + step * 14 * DAY_MS);
  const monthIndex = first.getUTCMonth() + step;
  const year = first.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(first.getUTCDate(), lastDay), first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds(), first.getUTCMilliseconds()),
  );
}

/**
 * Numeri delle visite da mettere in agenda adesso: dopo l'ultima già creata,
 * tutte quelle entro `RECURRING_HORIZON_DAYS` da `now`, e comunque la
 * prossima dopo `now`. Le date già passate non si creano mai (giro saltato:
 * si riparte dalla prossima). Mai più di 8 in una volta.
 */
export function recurringVisitsToCreate(first: Date, frequency: RecurringFrequency, lastNumber: number, now: Date): number[] {
  const horizon = now.getTime() + RECURRING_HORIZON_DAYS * DAY_MS;
  const numbers: number[] = [];
  let number = Math.max(1, Math.floor(lastNumber)) + 1;
  for (let guard = 0; guard < 2000 && recurringVisitDate(first, frequency, number).getTime() <= now.getTime(); guard++) number++;
  const needNext = recurringVisitDate(first, frequency, Math.max(1, Math.floor(lastNumber))).getTime() <= now.getTime();
  while (numbers.length < 8) {
    const at = recurringVisitDate(first, frequency, number);
    if (at.getTime() > horizon && !(needNext && numbers.length === 0)) break;
    numbers.push(number);
    number++;
  }
  return numbers;
}

/** Riga breve per schede ed email: "Ogni 2 settimane, prezzo a visita". */
export function recurringSummary(frequency: RecurringFrequency): string {
  return `${RECURRING_FREQUENCY_LABELS[frequency]}, prezzo a visita`;
}

/** Visita di un lavoro ricorrente, nelle schede di cliente e professionista. */
export type RecurringVisitInfo = {
  seriesId: string;
  frequency: RecurringFrequency;
  /** 1 = la prima visita, quella del preventivo. */
  number: number;
  /** Saltata con "Salta questa volta" (o da sola, se l'ora era occupata). */
  skippedAt: string | null;
  /** Serie interrotta, e da chi. */
  stoppedAt: string | null;
  stoppedBy: "CLIENT" | "PROFESSIONAL" | "SYSTEM" | null;
  /** Visite pagate online con la carta salvata alla prima. */
  paysOnline: boolean;
};

type VisitLike = { id: string; status: string; scheduledAt: string; clientConfirmedCompletedAt?: string | null; recurring: { seriesId: string } | null };

/**
 * La visita da mostrare nella scheda della richiesta: la prima, in ordine di
 * data, che chiede ancora qualcosa a chi guarda (per il professionista
 * "Lavoro terminato"; per il cliente anche la conferma di una visita già
 * chiusa dal professionista). Se non ce n'è, l'ultima. Le altre stanno
 * nell'elenco delle visite.
 */
export function currentRecurringVisit<T extends VisitLike>(visits: readonly T[], side: "CLIENT" | "PROFESSIONAL"): T | null {
  const byDate = [...visits].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const open = byDate.find(
    (visit) => visit.status === "CONFIRMED" || visit.status === "PENDING" || (side === "CLIENT" && visit.status === "COMPLETED" && !visit.clientConfirmedCompletedAt),
  );
  if (open) return open;
  const notCanceled = byDate.filter((visit) => visit.status !== "CANCELED");
  return notCanceled[notCanceled.length - 1] ?? byDate[byDate.length - 1] ?? null;
}

/**
 * Un lavoro per richiesta nelle schede: per un lavoro ricorrente la visita
 * di `currentRecurringVisit`, altrimenti come sempre il lavoro non annullato
 * (un appuntamento annullato non copre quello nato dopo da un altro
 * preventivo, §346).
 */
export function jobByRequest<T extends VisitLike & { guidedRequestId: string | null }>(jobs: readonly T[], side: "CLIENT" | "PROFESSIONAL"): Map<string, T> {
  const map = new Map<string, T>();
  const series = new Map<string, T[]>();
  for (const job of jobs) {
    if (!job.guidedRequestId) continue;
    if (job.recurring) {
      series.set(job.guidedRequestId, [...(series.get(job.guidedRequestId) ?? []), job]);
      continue;
    }
    const current = map.get(job.guidedRequestId);
    if (!current || current.status === "CANCELED") map.set(job.guidedRequestId, job);
  }
  for (const [requestId, visits] of series) {
    const current = map.get(requestId);
    const visit = currentRecurringVisit(visits, side);
    if (visit && (!current || current.status === "CANCELED")) map.set(requestId, visit);
  }
  return map;
}
