/**
 * Promemoria di manutenzione del cliente (funzione nuova 5 del controllo
 * pre-lancio dell'08/11/2026, docs/changelog/2026-11-08-promemoria-manutenzione.md):
 * a lavoro terminato "Ricordamelo tra…", e alla data un avviso sul sito e
 * un'email con "Prenota di nuovo" dallo stesso professionista.
 */

export const REBOOK_REMINDER_OPTIONS = [
  { key: "2w", label: "Tra 2 settimane", days: 14 },
  { key: "1m", label: "Tra 1 mese", days: 30 },
  { key: "3m", label: "Tra 3 mesi", days: 91 },
  { key: "6m", label: "Tra 6 mesi", days: 182 },
  { key: "1y", label: "Tra 1 anno", days: 365 },
] as const;
export type RebookReminderKey = (typeof REBOOK_REMINDER_OPTIONS)[number]["key"];

/** Oltre è più probabilmente un errore che un'intenzione (un anno e un po' di margine). */
export const REBOOK_REMINDER_MAX_DAYS = 400;

/**
 * La scelta già in evidenza per mestiere: ogni quanto di solito si rifà il
 * lavoro (pulizie ogni 2 settimane, giardino ogni mese, caldaia e
 * condizionatore ogni anno, tende a fine stagione). `null` dove non c'è un ritmo tipico: nessuna
 * scelta in evidenza.
 */
const SUGGESTED: Partial<Record<string, RebookReminderKey>> = {
  pulizie: "2w",
  giardiniere: "1m",
  dogsitter: "1m",
  babysitter: "1m",
  climatizzazione: "1y",
  "tende-da-sole": "1y",
};

export function suggestedRebookReminder(categorySlug: string | null | undefined): RebookReminderKey | null {
  return (categorySlug && SUGGESTED[categorySlug]) || null;
}

/** La data del promemoria, alle 9 italiane (ora di parete): mai un'email di notte. */
export function rebookReminderDate(key: RebookReminderKey, now: Date = new Date()): Date {
  const option = REBOOK_REMINDER_OPTIONS.find((o) => o.key === key)!;
  const day = new Date(now.getTime() + option.days * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  // 9:00 a Roma è 7:00 o 8:00 UTC: 8:00 UTC cade sempre tra le 9 e le 10.
  return new Date(`${day}T08:00:00.000Z`);
}
