/**
 * Professionisti in numeri, area admin (richiesta dell'utente del 26/10/2026,
 * docs/CHANGELOG.md §368): quanti sono e come si dividono, con i filtri per
 * categoria e città. Esclusi i profili eliminati e quelli dimostrativi.
 */

/** Stato del profilo, uno solo per professionista, nell'ordine di questa lista. */
export const PROFESSIONAL_STATUS_KEYS = ["VISIBLE", "FISCAL_MISSING", "PAUSED", "INVITE_PENDING", "BLOCKED", "SUSPENDED"] as const;
export type ProfessionalStatusKey = (typeof PROFESSIONAL_STATUS_KEYS)[number];

export const PROFESSIONAL_STATUS_LABEL: Record<ProfessionalStatusKey, string> = {
  VISIBLE: "Visibili nella ricerca",
  FISCAL_MISSING: "Dati fiscali da completare",
  PAUSED: "In pausa (abbonamento)",
  INVITE_PENDING: "Creati al telefono, da confermare",
  BLOCKED: "Bloccati per segnalazioni",
  SUSPENDED: "Sospesi",
};

export const PROFESSIONAL_PLAN_KEYS = ["TRIAL", "FOUNDER", "BASE", "PLUS", "PRO", "NONE"] as const;
export type ProfessionalPlanKey = (typeof PROFESSIONAL_PLAN_KEYS)[number];

export const PROFESSIONAL_PLAN_LABEL: Record<ProfessionalPlanKey, string> = {
  TRIAL: "Mesi gratis, senza carta",
  FOUNDER: "Mesi gratis, con la carta",
  BASE: "Base",
  PLUS: "Plus",
  PRO: "Pro",
  NONE: "Senza abbonamento",
};

export const PROFESSIONAL_ENTITY_KEYS = ["PRIVATE_INDIVIDUAL", "SOLE_PROPRIETOR", "BUSINESS", "UNKNOWN"] as const;
export type ProfessionalEntityKey = (typeof PROFESSIONAL_ENTITY_KEYS)[number];

export const PROFESSIONAL_ENTITY_LABEL: Record<ProfessionalEntityKey, string> = {
  PRIVATE_INDIVIDUAL: "Privati (lavoro occasionale)",
  SOLE_PROPRIETOR: "Con Partita IVA",
  BUSINESS: "Aziende",
  UNKNOWN: "Non ancora indicato",
};

/** Giorni contati per copertura, risposte, preventivi (docs/CHANGELOG.md §369). */
export const PROFESSIONAL_ACTIVITY_DAYS = 90;

/** Passi dell'iscrizione: ognuno conta chi l'ha fatto, non chi si è fermato lì. */
export const PROFESSIONAL_FUNNEL_KEYS = ["REGISTERED", "FISCAL", "IDENTITY", "FIRST_QUOTE", "FIRST_JOB"] as const;
export type ProfessionalFunnelKey = (typeof PROFESSIONAL_FUNNEL_KEYS)[number];

export const PROFESSIONAL_FUNNEL_LABEL: Record<ProfessionalFunnelKey, string> = {
  REGISTERED: "Profilo creato",
  FISCAL: "Dati fiscali compilati",
  IDENTITY: "Identità verificata",
  FIRST_QUOTE: "Almeno un preventivo mandato",
  FIRST_JOB: "Almeno un lavoro accettato",
};

export const PROFESSIONAL_COMPLETENESS_KEYS = ["PHOTO", "BIO", "SERVICES", "AGENDA", "ALL"] as const;
export type ProfessionalCompletenessKey = (typeof PROFESSIONAL_COMPLETENESS_KEYS)[number];

export const PROFESSIONAL_COMPLETENESS_LABEL: Record<ProfessionalCompletenessKey, string> = {
  PHOTO: "Con la foto",
  BIO: "Con la descrizione",
  SERVICES: "Con le prestazioni e i prezzi",
  AGENDA: "Con l'agenda",
  ALL: "Con tutte e quattro",
};

export type AdminProfessionalStats = {
  /** Professionisti con i filtri scelti. */
  total: number;
  /** Iscritti negli ultimi 30 giorni, con i filtri scelti. */
  new30d: number;
  /** Non contati sopra: eliminati, dimostrativi e account di prova (con i filtri scelti). */
  excluded: { deleted: number; demo: number; test: number };
  /** Da quando conta l'attività (richieste, risposte, ricerche), docs/CHANGELOG.md §395: il lancio, `null` prima. */
  countingFrom: string | null;
  /** Data del lancio (`LAUNCH_DATE`), `null` se non impostata. */
  launchDate: string | null;
  byStatus: { key: ProfessionalStatusKey; count: number }[];
  /** Tutte le categorie, anche a zero. Un professionista ne ha da 1 a 3: le percentuali non fanno 100. */
  byCategory: { slug: string; label: string; count: number }[];
  /** Città dal più numeroso. */
  byCity: { city: string; count: number }[];
  byPlan: { key: ProfessionalPlanKey; count: number }[];
  byEntity: { key: ProfessionalEntityKey; count: number }[];
  /**
   * Iscrizioni per mese (ora di Roma), dal più vecchio: da gennaio dell'anno
   * della prima iscrizione (almeno gli ultimi 12 mesi) al mese in corso. Chiave "2026-10".
   */
  byMonth: { key: string; count: number }[];
  /** Città in cui c'è almeno un professionista, per il filtro (senza filtri applicati). */
  cityOptions: string[];
  /** Hanno mandato un preventivo o scritto in chat negli ultimi 30 giorni. */
  active30d: number;
  funnel: { key: ProfessionalFunnelKey; count: number }[];
  completeness: { key: ProfessionalCompletenessKey; count: number }[];
  /**
   * Richieste degli ultimi PROFESSIONAL_ACTIVITY_DAYS giorni per categoria e
   * città, con quelle senza nessun preventivo e i professionisti visibili con
   * sede in quella città. Prima le zone con più richieste senza preventivo.
   */
  coverage: { categorySlug: string; categoryLabel: string; city: string; requests: number; unanswered: number; professionals: number }[];
  /**
   * Per categoria della richiesta, ultimi PROFESSIONAL_ACTIVITY_DAYS giorni:
   * richieste ricevute dai professionisti, a quante hanno risposto
   * (preventivo, messaggio o rifiuto), minuti (mediana) alla prima risposta,
   * preventivi mandati e accettati. Recensioni e voto medio da sempre.
   */
  byCategoryActivity: {
    slug: string;
    label: string;
    leads: number;
    answered: number;
    medianMinutesToAnswer: number | null;
    quotes: number;
    accepted: number;
    reviews: number;
    avgRating: number | null;
  }[];
  /** Ultimi 12 mesi: profili eliminati, messi in pausa (e ancora in pausa), abbonamenti annullati. */
  churnByMonth: { key: string; deleted: number; paused: number; canceled: number }[];
  /** Cosa cercano sul sito (§370). */
  searches: AdminSearchStats;
};

/**
 * Ricerche degli ultimi PROFESSIONAL_ACTIVITY_DAYS giorni (docs/CHANGELOG.md
 * §370), contate per giorno e città, mai chi cerca né il testo scritto.
 * `empty`: nessun professionista entro il raggio. Una pagina ricaricata
 * conta di nuovo.
 */
export type AdminSearchStats = {
  total: number;
  empty: number;
  /** Senza lavoro scelto, con una parola scritta (di solito un nome). */
  withText: number;
  /** Senza lavoro scelto né parole: solo la città. */
  cityOnly: number;
  /** Città cercate, dalla più cercata ("" = senza città). */
  byCity: { city: string; searches: number; empty: number }[];
  /** Lavoro e città cercati, prima quelli con più ricerche senza nessuno vicino. */
  byCategoryCity: { categorySlug: string; categoryLabel: string; city: string; searches: number; empty: number; professionals: number }[];
};

/**
 * Avviso del lunedì agli admin (docs/CHANGELOG.md §371): lavoro + città con
 * almeno tante ricerche senza nessun professionista vicino negli ultimi
 * SEARCH_DEMAND_ALERT_DAYS giorni. Al massimo SEARCH_DEMAND_ALERT_ROWS righe.
 */
export const SEARCH_DEMAND_ALERT_DAYS = 7;
export const SEARCH_DEMAND_ALERT_MIN_EMPTY = 5;
export const SEARCH_DEMAND_ALERT_ROWS = 5;

/** Percentuale leggibile: "<1%" per una quota piccola ma non nulla. */
export function sharePercentLabel(count: number, total: number): string {
  if (total <= 0 || count <= 0) return "0%";
  const pct = (count / total) * 100;
  if (pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/**
 * Imbuto dell'iscrizione per settimana (docs/changelog/2026-10-30-iscrizione-carta-solida.md):
 * account → email confermata → profilo → carta per l'abbonamento → dati
 * fiscali → identità → pagamenti online (facoltativo). Ogni passo conta chi
 * l'ha fatto, qualunque sia l'ordine.
 */
export const SIGNUP_FUNNEL_STEPS = ["ACCOUNT", "EMAIL", "PROFILE", "CARD", "FISCAL", "IDENTITY", "PAYMENTS"] as const;
export type SignupFunnelStep = (typeof SIGNUP_FUNNEL_STEPS)[number];

export const SIGNUP_FUNNEL_LABEL: Record<SignupFunnelStep, string> = {
  ACCOUNT: "Account creato",
  EMAIL: "Email confermata",
  PROFILE: "Profilo salvato",
  CARD: "Carta data",
  FISCAL: "Dati fiscali",
  IDENTITY: "Identità verificata",
  PAYMENTS: "Pagamenti online (facoltativo)",
};

/**
 * Soglie di successo proposte a Luca il 30/10/2026: chi salva il profilo dà
 * la carta entro 24 ore almeno 6 volte su 10, ed entro 7 giorni (dopo i due
 * promemoria) almeno 8 volte su 10.
 */
export const CARD_WITHIN_24H_TARGET = 0.6;
export const CARD_WITHIN_7D_TARGET = 0.8;

export type SignupFunnelWeek = {
  /** Lunedì della settimana di iscrizione (ora di Roma), AAAA-MM-GG. */
  weekStart: string;
  counts: Record<SignupFunnelStep, number>;
  /** Carta data entro 24 ore / 7 giorni dal primo salvataggio del profilo. */
  cardWithin24h: number;
  cardWithin7d: number;
};

export type AdminSignupFunnel = {
  /** Da quando si conta (lancio), null prima del lancio. */
  countingFrom: string | null;
  /** Settimane più recenti per prime, al massimo 12. */
  weeks: SignupFunnelWeek[];
  total: Omit<SignupFunnelWeek, "weekStart">;
};
