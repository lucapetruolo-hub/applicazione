/**
 * Abbonamento unico a livelli per il professionista (decisione dell'utente
 * del 28/09/2026, CLAUDE.md §6, docs/CHANGELOG.md §161): tutte le funzioni
 * per tutti; i livelli si distinguono solo per quanti lavori accettati al
 * mese sono compresi. Un "lavoro accettato" è una prenotazione (`Booking`):
 * nasce quando il cliente accetta un preventivo o prenota dall'agenda, mai
 * quando il professionista segna "completato".
 */

/**
 * Prezzi IVA esclusa (decisione dell'utente del 26/10/2026, docs/CHANGELOG.md
 * §354): mostrati "+ IVA", l'IVA si aggiunge in fattura. L'annuale costa
 * dieci mensilità ("Risparmi 2 mesi"); `annualMonthlyEurCents` è il prezzo
 * al mese arrotondato all'euro da mostrare accanto al totale annuo.
 */
export const SUBSCRIPTION_TIERS = [
  { tier: "BASE", label: "Base", priceEurCents: 1900, annualPriceEurCents: 19000, annualMonthlyEurCents: 1600, monthlyAcceptedJobs: 3 },
  { tier: "PLUS", label: "Plus", priceEurCents: 5900, annualPriceEurCents: 59000, annualMonthlyEurCents: 4900, monthlyAcceptedJobs: 10 },
  { tier: "PRO", label: "Pro", priceEurCents: 9900, annualPriceEurCents: 99000, annualMonthlyEurCents: 8300, monthlyAcceptedJobs: null },
] as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number]["tier"];

/** Rinnovo mensile o annuale; l'annuale è quello mostrato per primo. */
export type BillingInterval = "MONTH" | "YEAR";

export function parseBillingInterval(value: string | null | undefined): BillingInterval | null {
  return value === "MONTH" || value === "YEAR" ? value : null;
}

/** IVA italiana aggiunta ai prezzi dell'abbonamento. */
export const VAT_RATE = 0.22;

export function withVatEurCents(cents: number): number {
  return Math.round(cents * (1 + VAT_RATE));
}

/** Prezzo del livello per un periodo intero (un mese o un anno), IVA esclusa. */
export function tierPeriodPriceEurCents(tier: SubscriptionTier, interval: BillingInterval): number {
  const info = subscriptionTierInfo(tier);
  return interval === "YEAR" ? info.annualPriceEurCents : info.priceEurCents;
}

/**
 * Passaggio a un livello superiore prima del rinnovo (decisione dell'utente
 * del 26/10/2026): 10 € fissi più la differenza di prezzo per i giorni che
 * restano, maggiorata del 10%. Senza tetto: con quasi tutto il periodo
 * davanti costa più della differenza piena, e spinge a scegliere subito il
 * livello giusto. IVA esclusa.
 */
export const UPGRADE_FIXED_FEE_EUR_CENTS = 1000;
export const UPGRADE_SURCHARGE = 0.1;

export function upgradeFeeEurCents(input: {
  from: SubscriptionTier;
  to: SubscriptionTier;
  interval: BillingInterval;
  /** Millisecondi da adesso al rinnovo (o alla fine del periodo gratuito in corso). */
  remainingMs: number;
  /** Durata dell'intero periodo in millisecondi. */
  periodMs: number;
}): number {
  const difference = Math.max(0, tierPeriodPriceEurCents(input.to, input.interval) - tierPeriodPriceEurCents(input.from, input.interval));
  if (difference === 0 || input.periodMs <= 0) return 0;
  const share = Math.min(1, Math.max(0, input.remainingMs / input.periodMs));
  return UPGRADE_FIXED_FEE_EUR_CENTS + Math.round(difference * share * (1 + UPGRADE_SURCHARGE));
}

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
  /** Rinnovo dell'abbonamento pagato; null durante e dopo la prova se non ne è stato scelto uno. */
  billingInterval: BillingInterval | null;
  /**
   * Quanto costa adesso passare a ciascun livello superiore (IVA esclusa) e
   * fino a quando vale prima del rinnovo (docs/CHANGELOG.md §354). Vuoto se
   * non c'è un livello superiore o non si può passare (prova finita,
   * abbonamento concluso). `amountEurCents` 0 prima del lancio, quando la
   * prova non scorre ancora.
   */
  upgradeQuotes: { tier: SubscriptionTier; amountEurCents: number; until: string | null }[];
  /** Pagamenti attivi su questo ambiente (chiave Stripe presente). */
  checkoutAvailable: boolean;
  /** Profilo non visibile finché non compila tipo e dati fiscali (docs/CHANGELOG.md §241). */
  fiscalDataNeeded: boolean;
  /** Deve verificare l'identità prima di inviare preventivi (docs/CHANGELOG.md §253). */
  identityVerificationNeeded: boolean;
};
