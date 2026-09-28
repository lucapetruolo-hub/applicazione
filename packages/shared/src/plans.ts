/**
 * Abbonamento unico a livelli per il professionista (decisione dell'utente
 * del 28/09/2026, CLAUDE.md §6, docs/CHANGELOG.md §161): tutte le funzioni
 * per tutti; i livelli si distinguono solo per quanti lavori accettati al
 * mese sono compresi. Un "lavoro accettato" è una prenotazione (`Booking`):
 * nasce quando il cliente accetta un preventivo o prenota dall'agenda, mai
 * quando il professionista segna "completato".
 */

export const SUBSCRIPTION_TIERS = [
  { tier: "BASE", label: "Base", priceEurCents: 1900, monthlyAcceptedJobs: 5 },
  { tier: "PLUS", label: "Plus", priceEurCents: 3900, monthlyAcceptedJobs: 15 },
  { tier: "PRO", label: "Pro", priceEurCents: 6900, monthlyAcceptedJobs: null },
] as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number]["tier"];

/** Funzioni comprese in ogni livello: solo ciò che il sito offre davvero oggi. */
export const SUBSCRIPTION_FEATURES = [
  "Profilo pubblico nella ricerca della tua zona",
  "Richieste di preventivo dai clienti",
  "Preventivi e chat con i clienti",
  "Agenda e prenotazioni online",
  "Promemoria email anti no-show",
  "Recensioni da lavori confermati",
  "Statistiche della tua attività",
] as const;

/** Primo mese gratis per tutti. */
export const TRIAL_DAYS = 30;
/** Mese regalato a chi non ha ancora avuto lavori: comunicato solo pochi giorni prima della scadenza. */
export const BONUS_MONTH_DAYS = 30;
export const BONUS_MONTH_NOTICE_DAYS = 3;
/** Avviso quando si usa questa quota del limite mensile. */
export const USAGE_WARNING_RATIO = 0.8;

export function subscriptionTierInfo(tier: SubscriptionTier) {
  return SUBSCRIPTION_TIERS.find((t) => t.tier === tier)!;
}

/**
 * Stato dell'abbonamento visto dal professionista (`GET
 * /professionals/me/subscription`).
 * - `TRIAL`: prova gratuita in corso, senza limite di lavori.
 * - `TRIAL_ENDED`: prova finita e nessun livello scelto. Oggi non blocca
 *   nulla: cosa succede dopo va ancora deciso con l'utente.
 * - `ACTIVE`/`PAST_DUE`/`CANCELED`: abbonamento a pagamento via Stripe.
 */
export type MySubscription = {
  state: "TRIAL" | "TRIAL_ENDED" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  /** Livello pagato; null durante e dopo la prova se non ne è stato scelto uno. */
  tier: SubscriptionTier | null;
  trialEndsAt: string | null;
  /** Il mese regalato è già stato dato (viene mostrato solo dopo, mai prima). */
  bonusMonthGranted: boolean;
  usage: {
    /** Lavori accettati nel mese corrente (ora italiana). */
    acceptedJobsThisMonth: number;
    /** null = nessun limite (prova, livello Pro). */
    monthlyLimit: number | null;
    /** Es. "settembre 2026". */
    monthLabel: string;
  };
  /** Pagamenti attivi su questo ambiente (chiave Stripe presente). */
  checkoutAvailable: boolean;
};
