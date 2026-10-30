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
 * §361): mostrati "+ IVA", l'IVA si aggiunge in fattura. L'annuale costa
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

/**
 * Passaggio a Plus o Pro durante i mesi gratis (decisione di Luca del
 * 29/10/2026, docs/changelog/2026-10-29-offerta-mesi-gratis.md): si paga il
 * mese del nuovo livello meno il mese Base regalato, e da quel giorno parte
 * un mese nuovo con 0 lavori. I mesi gratis che restano aspettano il ritorno
 * a Base. IVA esclusa.
 */
export function freeMonthUpgradeEurCents(to: SubscriptionTier): number {
  return Math.max(0, tierPeriodPriceEurCents(to, "MONTH") - tierPeriodPriceEurCents("BASE", "MONTH"));
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

/** Un mese gratis dura 30 giorni e vale come il livello Base (stesso limite di lavori). */
export const TRIAL_DAYS = 30;
/** Avviso di fine mesi gratis questi giorni prima. */
export const TRIAL_ENDING_NOTICE_DAYS = 3;

/**
 * Offerta di lancio (decisione dell'utente del 26/10/2026, docs/CHANGELOG.md
 * §363): sul sito "i primi 100 professionisti hanno Base gratis per 3 mesi".
 * Dal 29/10/2026 (docs/changelog/2026-10-29-offerta-mesi-gratis.md) i mesi
 * gratis li decide l'offerta in Admin e valgono per tutti gli iscritti finché
 * è attiva; i posti numerati restano solo per la scritta pubblica.
 */
export const FOUNDER_SPOTS = 100;
export const FOUNDER_FREE_MONTHS = 3;

/**
 * Offerta dei mesi gratis (decisione di Luca del 29/10/2026): chi si iscrive
 * mentre è attiva riceve quei mesi Base gratis, uno dopo l'altro, poi parte
 * Base mensile sulla carta già data. Senza nessuna offerta creata vale
 * l'offerta di partenza da 3 mesi.
 */
export const DEFAULT_FREE_MONTHS = FOUNDER_FREE_MONTHS;
export const MAX_OFFER_FREE_MONTHS = 12;

/** Offerta dei mesi gratis vista in Admin (`GET /admin/subscription-offer`). */
export type AdminSubscriptionOffer = {
  /** Offerta attiva; null se Luca l'ha fermata e non ne ha creata un'altra. */
  current: { freeMonths: number; startedAt: string | null } | null;
  /** Offerte passate, la più recente prima. */
  history: { freeMonths: number; startedAt: string; stoppedAt: string | null }[];
  /** Iscritti (esclusi account di prova, dimostrativi e chiusi): in tutto e da quando è partita l'offerta attiva. */
  signups: {
    professionals: { total: number; sinceOffer: number | null };
    clients: { total: number; sinceOffer: number | null };
  };
  /** Professionisti ancora nei mesi gratis, e quanti hanno mesi gratis in attesa. */
  inFreeMonths: number;
  withWaitingMonths: number;
};

/**
 * Professionisti con il profilo ma senza la carta per i mesi gratis, da
 * chiamare (docs/changelog/2026-10-30-iscrizione-carta-solida.md). Senza
 * account di prova; i più vecchi prima.
 */
export type AdminProfessionalWithoutCard = {
  userId: string;
  businessName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string;
  profileCreatedAt: string;
  /** Promemoria "Completa il profilo" già mandati. */
  remindersSent: number;
};

/**
 * Posti dell'offerta di lancio e mesi gratis dell'offerta attiva (`GET
 * /subscriptions/founders`, pubblico). `offerMonths` null: offerta ferma.
 */
export type FounderSpots = { total: number; left: number; offerMonths: number | null };

/** Elenco dei fondatori per l'area admin (`GET /admin/founders`, §363). */
export type AdminFounders = {
  total: number;
  taken: number;
  rows: {
    number: number;
    businessName: string;
    email: string;
    city: string;
    /** Iscrizione del profilo. */
    joinedAt: string;
    /** Fine dei mesi gratuiti; null prima del lancio, quando non scorrono ancora. */
    freeUntil: string | null;
    /** Livello già scelto (pagherà a fine mesi gratuiti), null se nessuno. */
    tier: SubscriptionTier | null;
    deleted: boolean;
  }[];
};
/** Avviso quando si usa questa quota del limite mensile. */
export const USAGE_WARNING_RATIO = 0.8;

/** Avviso di rinnovo automatico (o di fine abbonamento annullato) questi giorni prima. */
export const RENEWAL_NOTICE_DAYS = 3;
/**
 * Avviso del primo addebito dopo i mesi gratis, a chi ha dato la carta:
 * almeno 7 giorni prima, come chiedono le regole di Visa e Mastercard sulle
 * prove gratuite con carta (docs/changelog/2026-10-30-iscrizione-carta-solida.md).
 */
export const FREE_MONTHS_END_NOTICE_DAYS = 7;

/**
 * Perché un account professionista è in pausa (docs/CHANGELOG.md §162):
 * fuori dalla ricerca e senza nuove richieste finché non si sceglie o
 * rinnova un livello. I lavori esauriti non mettono più in pausa (§362):
 * vedi `MySubscription.limitReached`. `CARD_NEEDED`: dal lancio i mesi gratis
 * valgono solo con la carta data (decisione di Luca del 29/10/2026).
 */
export type PauseReason = "TRIAL_ENDED" | "SUBSCRIPTION_ENDED" | "CARD_NEEDED";

/**
 * Errore dell'API per chi prova a mandare un preventivo o a rispondere per
 * primo con i lavori esauriti (§362): il sito lo riconosce e apre la
 * finestra del livello superiore invece di mostrare il testo.
 */
export const JOB_LIMIT_REACHED_MESSAGE = "Hai esaurito i lavori compresi nel tuo abbonamento: passa al livello superiore per rispondere.";

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
  /** Il mese regalato è già stato dato (regola tolta il 29/10/2026, resta per chi l'ha avuto). */
  bonusMonthGranted: boolean;
  /**
   * Mesi gratis di questo giro (docs/changelog/2026-10-29-offerta-mesi-gratis.md).
   * `currentMonth` è il mese gratis in corso, 0 se non sono ancora partiti
   * (prima del lancio); null finiti o interrotti. Null senza mesi gratis.
   */
  freeMonths: { months: number; currentMonth: number | null } | null;
  /** Mesi gratis in attesa dopo il passaggio a Plus o Pro: ripartono tornando a Base. */
  freeMonthsWaiting: number;
  /** Ha chiesto di tornare a Base alla scadenza del mese pagato. */
  returnToBase: boolean;
  /** Mesi gratis senza la carta: dal lancio il profilo resta in pausa finché non la mette. */
  cardNeeded: boolean;
  /**
   * Lavori del periodo in corso (docs/CHANGELOG.md §362): ripartono al
   * rinnovo, non il 1° del mese. Su Plus e Pro lo stesso cliente conta una
   * volta per periodo (`countsClientsOnce`).
   */
  usage: {
    used: number;
    /** null = nessun limite (Pro). */
    limit: number | null;
    periodStart: string;
    /** Inizio del periodo successivo: i lavori ripartono qui. */
    periodEnd: string;
    countsClientsOnce: boolean;
  };
  /**
   * Lavori del periodo esauriti (§362): il profilo resta nella ricerca e
   * riceve le richieste, ma non può mandare preventivi nuovi né rispondere
   * per primo a una richiesta finché non passa al livello superiore o non
   * ripartono i lavori.
   */
  limitReached: boolean;
  /** Rinnovo dell'abbonamento pagato; null durante e dopo la prova se non ne è stato scelto uno. */
  billingInterval: BillingInterval | null;
  /**
   * Quanto costa adesso passare a ciascun livello superiore (IVA esclusa) e
   * fino a quando vale prima del rinnovo (docs/CHANGELOG.md §361). Nei mesi
   * gratis: il mese del livello meno Base, `until` null (parte un mese nuovo).
   * Vuoto se non c'è un livello superiore o non si può passare (prima del
   * lancio, prova finita, abbonamento concluso).
   */
  upgradeQuotes: { tier: SubscriptionTier; amountEurCents: number; until: string | null }[];
  /** Pagamenti attivi su questo ambiente (chiave Stripe presente). */
  checkoutAvailable: boolean;
  /** Profilo non visibile finché non compila tipo e dati fiscali (docs/CHANGELOG.md §241). */
  fiscalDataNeeded: boolean;
  /** Deve verificare l'identità prima di inviare preventivi (docs/CHANGELOG.md §253). */
  identityVerificationNeeded: boolean;
};
