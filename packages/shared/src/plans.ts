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

/** Primo mese gratis per tutti: vale come il livello Base (stesso limite di lavori). */
export const TRIAL_DAYS = 30;
/** Mese regalato a chi non ha ancora avuto lavori: comunicato solo pochi giorni prima della scadenza. */
export const BONUS_MONTH_DAYS = 30;
export const BONUS_MONTH_NOTICE_DAYS = 3;
/** Avviso quando si usa questa quota del limite mensile. */
export const USAGE_WARNING_RATIO = 0.8;

/** Avviso di rinnovo automatico (o di fine abbonamento annullato) questi giorni prima. */
export const RENEWAL_NOTICE_DAYS = 3;

/**
 * Perché un account professionista è in pausa (docs/CHANGELOG.md §162):
 * fuori dalla ricerca e senza nuove richieste finché non si sceglie o
 * rinnova un livello, o finché non passa al livello superiore / al mese dopo.
 */
export type PauseReason = "TRIAL_ENDED" | "SUBSCRIPTION_ENDED" | "LIMIT_REACHED";

/** Differenza di prezzo mensile tra due livelli (mai negativa). */
export function tierPriceDifferenceEurCents(from: SubscriptionTier, to: SubscriptionTier): number {
  return Math.max(0, subscriptionTierInfo(to).priceEurCents - subscriptionTierInfo(from).priceEurCents);
}

export function subscriptionTierInfo(tier: SubscriptionTier) {
  return SUBSCRIPTION_TIERS.find((t) => t.tier === tier)!;
}

/**
 * Livello scelto passato in un indirizzo (`?livello=PLUS`, da
 * /per-professionisti a /registrati e /dashboard/abbonamento): `null` se
 * manca o non è un livello valido.
 */
export function parseSubscriptionTier(value: string | null | undefined): SubscriptionTier | null {
  return SUBSCRIPTION_TIERS.find((t) => t.tier === value)?.tier ?? null;
}

/**
 * Stato dell'abbonamento visto dal professionista (`GET
 * /professionals/me/subscription`).
 * - `TRIAL`: mese gratuito in corso, con il limite di lavori del livello Base.
 * - `TRIAL_ENDED`: mese gratuito finito e nessun livello scelto: account in pausa.
 * - `ACTIVE`/`PAST_DUE`: abbonamento a pagamento via Stripe, rinnovo automatico.
 * - `CANCELED`: abbonamento concluso: account in pausa.
 */
export type MySubscription = {
  state: "TRIAL" | "TRIAL_ENDED" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  /** Livello pagato; null durante e dopo la prova se non ne è stato scelto uno. */
  tier: SubscriptionTier | null;
  /** Account in pausa (fuori dalla ricerca, niente nuove richieste) e perché. */
  pausedReason: PauseReason | null;
  /** Prossimo rinnovo automatico, o fine dell'abbonamento se annullato. */
  currentPeriodEnd: string | null;
  /** Annullato: resta attivo fino a `currentPeriodEnd`, poi non si rinnova. */
  cancelAtPeriodEnd: boolean;
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
