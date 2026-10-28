import { z } from "zod";
import "./zod";
import type { TrafficSource } from "./trafficSources";

/**
 * Andamento del sito (richiesta di Luca del 27/10/2026, docs/CHANGELOG.md
 * §372): dove il sito perde clienti e professionisti e dove c'è domanda
 * senza offerta. Solo conteggi per giorno, mai chi è la persona; i consigli
 * in parole semplici arrivano al super admin nella pagina "Andamento del
 * sito" e nell'email del lunedì.
 */

/** Giorni guardati per il numero guida, i consigli e i passi della richiesta. */
export const SITE_STATS_WINDOW_DAYS = 28;
/** Settimane del grafico del numero guida e delle coorti. */
export const SITE_STATS_WEEKS = 12;
export const SITE_COHORT_WEEKS = 8;
/** Mesi per cui si tengono i contatori, poi si cancellano (§372). */
export const SITE_COUNTERS_RETENTION_MONTHS = 25;

/** Numero guida: verde da qui in su. */
export const GUIDE_GREEN_SHARE = 0.7;
/** Numero guida: rosso sotto questa quota. */
export const GUIDE_RED_SHARE = 0.4;
/** Ore entro cui deve arrivare il primo preventivo. */
export const GUIDE_QUOTE_HOURS = 24;
/** Sotto questi casi una percentuale inganna: si scrive "7 su 9". */
export const MIN_CASES_FOR_PERCENT = 30;
/** Righe con meno casi si accorpano in "altre" (privacy). */
export const MIN_CASES_PER_ROW = 3;

/** Tappa silenziosa del lancio: i numeri da raggiungere prima di aprire il sito a Google. */
export const GOOGLE_OPENING_TARGETS = {
  visibleProfessionals: 10,
  clientsWithRequest: 10,
  acceptedJobs: 5,
  paidOnline: 1,
  greenWeeks: 4,
} as const;

/** Prima di questi numeri i consigli sui prezzi non hanno senso. */
export const PRICE_ADVICE_MIN_DAYS_FROM_LAUNCH = 90;
export const PRICE_ADVICE_MIN_PAYING = 30;

/** Passi della richiesta di preventivo, nell'ordine in cui si incontrano. */
export const REQUEST_STEP_KEYS = ["LAVORO", "DOVE", "RIEPILOGO", "ACCESSO", "ACCESSO_FATTO", "INVIATA"] as const;
export type RequestStepKey = (typeof REQUEST_STEP_KEYS)[number];

export const REQUEST_STEP_LABEL: Record<RequestStepKey, string> = {
  LAVORO: "Aperta la richiesta (passo «Il lavoro»)",
  DOVE: "Arrivati al passo «Dove»",
  RIEPILOGO: "Arrivati al «Riepilogo»",
  ACCESSO: "Chiesto di accedere o registrarsi",
  ACCESSO_FATTO: "Accesso o registrazione fatti",
  INVIATA: "Richiesta inviata",
};

/** Nome breve del passo, per i consigli ("Semplifica il passo «Dove»"). */
export const REQUEST_STEP_SHORT: Record<RequestStepKey, string> = {
  LAVORO: "Il lavoro",
  DOVE: "Dove",
  RIEPILOGO: "Riepilogo",
  ACCESSO: "accesso o registrazione",
  ACCESSO_FATTO: "accesso o registrazione",
  INVIATA: "invio",
};

/** Moduli di cui si contano gli invii non riusciti. */
export const SUBMIT_FORM_KEYS = ["REGISTRAZIONE", "RICHIESTA", "PREVENTIVO", "ACCETTAZIONE", "MESSAGGIO"] as const;
export type SubmitFormKey = (typeof SUBMIT_FORM_KEYS)[number];

export const SUBMIT_FORM_LABEL: Record<SubmitFormKey, string> = {
  REGISTRAZIONE: "Registrazione",
  RICHIESTA: "Richiesta di preventivo",
  PREVENTIVO: "Invio del preventivo",
  ACCETTAZIONE: "Accettazione del preventivo",
  MESSAGGIO: "Messaggi in chat",
};

/** RETE: connessione caduta; SERVER: errore nostro; DATI: dati rifiutati dal modulo. */
export const SUBMIT_FAILURE_KINDS = ["RETE", "SERVER", "DATI"] as const;
export type SubmitFailureKind = (typeof SUBMIT_FAILURE_KINDS)[number];

export const SUBMIT_FAILURE_KIND_LABEL: Record<SubmitFailureKind, string> = {
  RETE: "Connessione assente",
  SERVER: "Errore del sito",
  DATI: "Dati non accettati",
};

/** Chi se ne va: cliente che elimina l'account, professionista che lo elimina, abbonamento annullato. */
export const CHURN_KINDS = ["CLIENT_ACCOUNT", "PRO_ACCOUNT", "SUBSCRIPTION"] as const;
export type ChurnKind = (typeof CHURN_KINDS)[number];

export const CHURN_KIND_LABEL: Record<ChurnKind, string> = {
  CLIENT_ACCOUNT: "Clienti che eliminano l'account",
  PRO_ACCOUNT: "Professionisti che eliminano l'account",
  SUBSCRIPTION: "Abbonamenti annullati",
};

export const CLIENT_CHURN_REASONS = ["FOUND_WHAT_NEEDED", "NO_PROFESSIONALS", "TOO_EXPENSIVE", "HARD_TO_USE", "TOO_MANY_EMAILS", "OTHER"] as const;
export const PRO_CHURN_REASONS = ["FEW_REQUESTS", "TOO_EXPENSIVE", "HARD_TO_USE", "NOT_WORKING_NOW", "OTHER_SITE", "OTHER"] as const;
export const CHURN_REASONS = ["FOUND_WHAT_NEEDED", "NO_PROFESSIONALS", "TOO_EXPENSIVE", "HARD_TO_USE", "TOO_MANY_EMAILS", "FEW_REQUESTS", "NOT_WORKING_NOW", "OTHER_SITE", "OTHER"] as const;
export type ChurnReason = (typeof CHURN_REASONS)[number];
export const churnReasonSchema = z.enum(CHURN_REASONS);

/** Testo che vede chi se ne va (scelta facoltativa) e che legge l'admin. */
export const CHURN_REASON_LABEL: Record<ChurnReason, string> = {
  FOUND_WHAT_NEEDED: "Ho trovato quello che mi serviva",
  NO_PROFESSIONALS: "Non ho trovato professionisti vicino a me",
  TOO_EXPENSIVE: "Costa troppo",
  HARD_TO_USE: "Il sito è difficile da usare",
  TOO_MANY_EMAILS: "Ricevo troppe email",
  FEW_REQUESTS: "Ricevo poche richieste",
  NOT_WORKING_NOW: "Non lavoro più o ho già troppo lavoro",
  OTHER_SITE: "Uso un altro sito",
  OTHER: "Altro",
};

/** Motivo facoltativo quando si elimina l'account o si annulla l'abbonamento (§372). */
export const churnReasonBodySchema = z.object({ reason: churnReasonSchema.optional() }).default({});
export type ChurnReasonBody = z.infer<typeof churnReasonBodySchema>;

/** Da dove arrivano i professionisti: le provenienze delle richieste più l'invito al telefono. */
export type SignupSourceKey = TrafficSource | "INVITE" | "unknown";

/** Da dove parte una richiesta: a tutti i professionisti della zona o dalla pagina di uno di loro. */
export const REQUEST_ORIGINS = ["GENERAL", "PROFILE"] as const;
export type RequestOrigin = (typeof REQUEST_ORIGINS)[number];

/**
 * Da quale pulsante parte una richiesta da un profilo (docs/CHANGELOG.md
 * §402), letto da `da=` nell'indirizzo di /preventivo: barra in basso,
 * pulsante nella pagina, orario dell'agenda del profilo, orario nei
 * risultati di ricerca; ALTRO per link senza `da` (vecchi o copiati).
 */
export const PROFILE_REQUEST_SOURCES = ["BARRA", "PAGINA", "AGENDA", "RICERCA", "ALTRO"] as const;
export type ProfileRequestSource = (typeof PROFILE_REQUEST_SOURCES)[number];

export const PROFILE_REQUEST_SOURCE_LABEL: Record<ProfileRequestSource, string> = {
  BARRA: "Barra in basso",
  PAGINA: "Pulsante nella pagina",
  AGENDA: "Orario dell'agenda",
  RICERCA: "Orario nei risultati di ricerca",
  ALTRO: "Altro (link senza origine)",
};

/** `da=` nell'indirizzo, minuscolo: il nome che si legge in un link condiviso. */
export const PROFILE_REQUEST_SOURCE_PARAM: Record<Exclude<ProfileRequestSource, "ALTRO">, string> = {
  BARRA: "barra",
  PAGINA: "pagina",
  AGENDA: "agenda",
  RICERCA: "ricerca",
};

export function profileRequestSourceOf(param: string | null | undefined): ProfileRequestSource {
  const found = (Object.entries(PROFILE_REQUEST_SOURCE_PARAM) as [ProfileRequestSource, string][]).find(([, value]) => value === param);
  return found ? found[0] : "ALTRO";
}

/** Dispositivo dalla larghezza dello schermo: TELEFONO fino a 767 px, come la barra. */
export const DEVICE_KINDS = ["COMPUTER", "TELEFONO"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = { COMPUTER: "Computer", TELEFONO: "Telefono" };

/** VISITA: profilo aperto; INIZIATA: aperta la richiesta; INVIATA: richiesta inviata. */
export const PROFILE_REQUEST_EVENTS = ["VISITA", "INIZIATA", "INVIATA"] as const;
export type ProfileRequestEvent = (typeof PROFILE_REQUEST_EVENTS)[number];

export const siteStepEventSchema = z.object({
  step: z.enum(REQUEST_STEP_KEYS),
  categorySlug: z.string().max(60).optional(),
  origin: z.enum(REQUEST_ORIGINS).optional(),
  /** Solo con origin PROFILE (§402). */
  source: z.enum(PROFILE_REQUEST_SOURCES).optional(),
  device: z.enum(DEVICE_KINDS).optional(),
});
export type SiteStepEvent = z.infer<typeof siteStepEventSchema>;

/**
 * Passi di chi usa le voci di "Quanto costa" (docs/CHANGELOG.md §399,
 * richiesta di Luca): voce toccata, profilo aperto da quell'elenco,
 * richiesta inviata partita da lì. Solo il passo e il giorno.
 */
export const PRICE_TOOL_STEP_KEYS = ["VOCE", "PROFILO", "RICHIESTA"] as const;
export type PriceToolStepKey = (typeof PRICE_TOOL_STEP_KEYS)[number];

export const PRICE_TOOL_STEP_LABEL: Record<PriceToolStepKey, string> = {
  VOCE: "Toccata una voce",
  PROFILO: "Aperto un profilo dall'elenco",
  RICHIESTA: "Richiesta inviata",
};

export const priceToolStepEventSchema = z.object({ step: z.enum(PRICE_TOOL_STEP_KEYS) });
export type PriceToolStepEvent = z.infer<typeof priceToolStepEventSchema>;

export const siteFailureEventSchema = z.object({
  form: z.enum(SUBMIT_FORM_KEYS),
  kind: z.enum(SUBMIT_FAILURE_KINDS),
});
export type SiteFailureEvent = z.infer<typeof siteFailureEventSchema>;

/** Profilo pubblico aperto, solo il dispositivo (§402). */
export const siteProfileViewEventSchema = z.object({ device: z.enum(DEVICE_KINDS) });
export type SiteProfileViewEvent = z.infer<typeof siteProfileViewEventSchema>;

export const siteNoteSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida."),
  text: z.string().trim().min(2, "Scrivi la nota.").max(140, "Al massimo 140 caratteri."),
});
export type SiteNoteInput = z.infer<typeof siteNoteSchema>;

/**
 * Cose successe che cambiano i numeri, segnate da sole sul grafico (§372).
 * Il lancio arriva da `LAUNCH_DATE`; i cambi di prezzo vanno aggiunti qui.
 */
export const SITE_AUTOMATIC_NOTES: { day: string; text: string }[] = [{ day: "2026-10-26", text: "Nuovi prezzi: 19, 59, 99 € + IVA" }];

/** Quanto è urgente un consiglio: prima i "Fallo subito". */
export const SITE_ADVICE_LEVELS = ["URGENT", "IMPORTANT", "TIP"] as const;
export type SiteAdviceLevel = (typeof SITE_ADVICE_LEVELS)[number];

export const SITE_ADVICE_LEVEL_LABEL: Record<SiteAdviceLevel, string> = {
  URGENT: "Fallo subito",
  IMPORTANT: "Questa settimana",
  TIP: "Quando hai tempo",
};

/**
 * Un consiglio già pronto per il super admin, scritto per chi non vuole
 * leggere i numeri: cosa fare, perché in una riga, e dove farlo.
 */
export type SiteAdvice = {
  /** Stabile tra un lunedì e l'altro (es. "recruit:idraulico:latina"). */
  key: string;
  level: SiteAdviceLevel;
  /** Il problema in poche parole: "Idraulico a Latina: servono più professionisti". */
  title: string;
  /** Perché, con il numero che lo dice. */
  why: string;
  /** Cosa fare, concreto. */
  todo: string;
  /** Persone o cose a cui si riferisce (es. i professionisti da chiamare). */
  items?: { label: string; detail?: string; href?: string }[];
  /** Pagina del sito dove farlo. */
  link?: { label: string; href: string };
};

/** Giorni in cui un consiglio segnato come fatto non torna (§372): il tempo di vedere se è servito. */
export const SITE_ADVICE_DONE_DAYS = 14;

/** Professionisti diversi che devono aver scritto a mano la stessa prestazione per consigliarla (§384). */
export const MISSING_SERVICE_MIN_PROFESSIONALS = 3;
/** Ricerche in 90 giorni da cui una prestazione offerta da pochi diventa un consiglio (§384). */
export const SERVICE_GAP_MIN_SEARCHES = 10;
/** Sotto questi professionisti una prestazione cercata è "offerta da pochi". */
export const SERVICE_GAP_MAX_OFFERED = 2;

export const siteAdviceDoneSchema = z.object({
  key: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
});
export type SiteAdviceDoneInput = z.infer<typeof siteAdviceDoneSchema>;
export const siteAdviceUndoSchema = z.object({ key: z.string().trim().min(1).max(200) });
export type SiteAdviceUndoInput = z.infer<typeof siteAdviceUndoSchema>;

/** Stato di una casella lavoro × città per il numero guida. */
export type GuideCellStatus = "GREEN" | "YELLOW" | "RED" | "NO_PROFESSIONALS";

export type AdminSiteStats = {
  windowDays: number;
  /** Numero guida degli ultimi SITE_STATS_WINDOW_DAYS giorni. */
  guide: { requests: number; withQuote: number };
  /** Numero guida per settimana (lunedì, ora di Roma), dalla più vecchia. */
  guideWeekly: { weekStart: string; requests: number; withQuote: number }[];
  /** Caselle lavoro × città, prima le rosse. Sotto MIN_CASES_PER_ROW richieste e senza ricerche a vuoto finiscono in `otherCells`. */
  cells: {
    categorySlug: string;
    categoryLabel: string;
    city: string;
    requests: number;
    withQuote: number;
    emptySearches: number;
    professionals: number;
    status: GuideCellStatus;
  }[];
  otherCells: { cells: number; requests: number; withQuote: number } | null;
  /** Percorso del cliente negli ultimi SITE_STATS_WINDOW_DAYS giorni. */
  clientFunnel: { key: ClientFunnelKey; count: number }[];
  /** Totale, e quanti dalla pagina di un professionista (`fromProfile`). */
  requestSteps: { key: RequestStepKey; count: number; fromProfile: number }[];
  /**
   * Richieste dai profili per pulsante e dispositivo, dal lancio (§402).
   * `since` è il giorno del lancio (AAAA-MM-GG), null se `LAUNCH_DATE` non
   * è impostata; `started` false prima del lancio (righe vuote).
   */
  profileSources: {
    since: string | null;
    started: boolean;
    rows: { event: ProfileRequestEvent; source: ProfileRequestSource | ""; device: DeviceKind; count: number }[];
  };
  /** Passi dalle voci di "Quanto costa" (§399). */
  priceToolSteps: { key: PriceToolStepKey; count: number }[];
  clientCohorts: { weekStart: string; clients: number; withQuote: number; accepted: number; reviewed: number; returned: number }[];
  professionalCohorts: { weekStart: string; registered: number; fiscal: number; identity: number; firstQuote: number; active: number }[];
  submitFailures: { form: SubmitFormKey; kind: SubmitFailureKind; count: number }[];
  /** Parole cercate in almeno 3 giorni diversi che non corrispondono a nessun lavoro. */
  unknownJobs: { term: string; days: number; searches: number }[];
  /**
   * Prestazioni dell'elenco suggerito cercate negli ultimi 90 giorni, per
   * lavoro (§384), con quanti professionisti le offrono.
   */
  popularServices: { categorySlug: string; categoryLabel: string; services: { service: string; searches: number; offeredBy: number }[] }[];
  /** Prestazioni scritte a mano da almeno MISSING_SERVICE_MIN_PROFESSIONALS professionisti e assenti dall'elenco suggerito. */
  missingServices: { categorySlug: string; categoryLabel: string; name: string; professionals: number }[];
  /** Professionisti iscritti negli ultimi 90 giorni, per provenienza. */
  signupSources: { source: SignupSourceKey; count: number }[];
  /** Motivi scelti negli ultimi 90 giorni. */
  churnReasons: { kind: ChurnKind; reason: ChurnReason; count: number }[];
  notes: { id: string | null; day: string; text: string }[];
  /** Richieste inviate contate dal browser contro quelle salvate, ultimi 14 giorni. */
  reconciliation: { days: number; counted: number; saved: number; ok: boolean };
  /** A che punto è la tappa silenziosa (GOOGLE_OPENING_TARGETS). */
  launch: { visibleProfessionals: number; clientsWithRequest: number; acceptedJobs: number; paidOnline: number; greenWeeks: number; ready: boolean };
  advice: SiteAdvice[];
  /** Consigli segnati come fatti negli ultimi SITE_ADVICE_DONE_DAYS giorni: non sono in `advice`. */
  doneAdvice: { key: string; title: string; doneAt: string; until: string }[];
};

export const CLIENT_FUNNEL_KEYS = ["SEARCHES", "PROFILE_VIEWS", "REQUEST_STARTED", "REQUEST_SENT", "WITH_QUOTE", "ACCEPTED", "COMPLETED", "REVIEWED"] as const;
export type ClientFunnelKey = (typeof CLIENT_FUNNEL_KEYS)[number];

export const CLIENT_FUNNEL_LABEL: Record<ClientFunnelKey, string> = {
  SEARCHES: "Ricerche fatte",
  PROFILE_VIEWS: "Profili aperti",
  REQUEST_STARTED: "Richieste iniziate",
  REQUEST_SENT: "Richieste inviate",
  WITH_QUOTE: `Con un preventivo entro ${GUIDE_QUOTE_HOURS} ore`,
  ACCEPTED: "Preventivo accettato",
  COMPLETED: "Lavoro terminato",
  REVIEWED: "Con recensione",
};

/** Stato della casella dal numero guida. */
export function guideCellStatus(requests: number, withQuote: number, professionals: number): GuideCellStatus {
  if (professionals === 0) return "NO_PROFESSIONALS";
  if (requests === 0) return "GREEN";
  const share = withQuote / requests;
  if (share >= GUIDE_GREEN_SHARE) return "GREEN";
  if (share < GUIDE_RED_SHARE) return "RED";
  return "YELLOW";
}

/** "7 su 9" sotto MIN_CASES_FOR_PERCENT casi, "78%" da lì in su: una percentuale su pochi casi inganna. */
export function ratioLabel(part: number, total: number): string {
  if (total <= 0) return "—";
  if (total < MIN_CASES_FOR_PERCENT) return `${part} su ${total}`;
  return `${Math.round((part / total) * 100)}%`;
}
