import { z } from "./zod";
import { findComuneByName } from "./data/comuni";
import { professionalCategorySlugSchema } from "./schemas";
import type { ProfessionalCategorySlug } from "./categories";

/**
 * Richieste generali (senza un professionista scelto) aperte o chiuse
 * (docs/CHANGELOG.md §211, decisione dell'utente): si possono chiudere per
 * tutto il sito (variabile `GENERAL_REQUESTS_ENABLED=false` su Render) o per
 * una singola categoria in una città, a mano dall'area admin oppure in
 * automatico quando i professionisti della zona ne ricevono troppe.
 */

/** Finestra su cui si misura il carico, in giorni. */
export const GENERAL_REQUESTS_WINDOW_DAYS = 14;

/**
 * Soglie della chiusura automatica, modificabili da /admin/richieste-generali
 * (docs/CHANGELOG.md §212). Valori iniziali in DEFAULT_GENERAL_REQUEST_THRESHOLDS.
 */
export type GeneralRequestThresholds = {
  /** Spento: nessuna zona si chiude da sola (restano le chiusure a mano). */
  autoCloseEnabled: boolean;
  /** Oltre questa media di richieste generali a settimana per professionista la zona si chiude. */
  maxWeeklyPerPro: number;
  /** Sotto questa percentuale di risposte la zona si chiude (0 = non si controlla). */
  minResponsePercent: number;
  /** Richieste ricevute da almeno 48 ore necessarie prima di giudicare le risposte. */
  minMeasuredLeads: number;
  /** Dopo una riapertura a mano, il controllo automatico non la richiude per questi giorni. */
  keepOpenDays: number;
};

export const DEFAULT_GENERAL_REQUEST_THRESHOLDS: GeneralRequestThresholds = {
  autoCloseEnabled: true,
  maxWeeklyPerPro: 10,
  minResponsePercent: 33,
  minMeasuredLeads: 20,
  keepOpenDays: 30,
};

export const generalRequestThresholdsSchema = z.object({
  autoCloseEnabled: z.boolean(),
  maxWeeklyPerPro: z.number().min(1, "Almeno 1 richiesta a settimana.").max(1000),
  minResponsePercent: z.number().int().min(0).max(100, "Al massimo 100%."),
  minMeasuredLeads: z.number().int().min(1, "Almeno 1 richiesta.").max(10_000),
  keepOpenDays: z.number().int().min(1, "Almeno 1 giorno.").max(365, "Al massimo 365 giorni."),
});

/** Chiave della città: il nome ufficiale del comune se riconosciuto, altrimenti il testo ripulito. */
export function generalRequestCityKey(city: string): string {
  return findComuneByName(city)?.name ?? city.trim();
}

export type GeneralRequestAvailability = {
  open: boolean;
  /** GLOBAL: chiuse in tutto il sito; ZONE: chiuse per questa categoria in questa città. */
  closedScope: "GLOBAL" | "ZONE" | null;
};

export type GeneralRequestLoad = {
  /** Richieste generali ricevute nella finestra, sommate su tutti i professionisti. */
  leads: number;
  /** Professionisti diversi che ne hanno ricevuta almeno una. */
  professionals: number;
  /** Richieste diverse inviate dai clienti. */
  requests: number;
  /** Richieste ricevute da almeno 48 ore (su queste si misura la quota di risposte). */
  measuredLeads: number;
  /** Di queste, quante hanno avuto un preventivo o un messaggio in chat. */
  respondedLeads: number;
};

/** Media settimanale per professionista nella finestra. */
export function weeklyPerProfessional(load: GeneralRequestLoad): number {
  if (load.professionals === 0) return 0;
  return load.leads / load.professionals / (GENERAL_REQUESTS_WINDOW_DAYS / 7);
}

/** Quota di risposte, null finché le richieste misurabili sono troppo poche. */
export function responseRate(load: GeneralRequestLoad, minMeasuredLeads: number = DEFAULT_GENERAL_REQUEST_THRESHOLDS.minMeasuredLeads): number | null {
  if (load.measuredLeads < minMeasuredLeads) return null;
  return load.respondedLeads / load.measuredLeads;
}

/** Perché una zona si è chiusa: troppe richieste, poche risposte o a mano. */
export type GeneralRequestCloseTrigger = "LOAD" | "RESPONSES" | "MANUAL";

/** Motivo per chiudere la categoria in quella città, o null se il carico è accettabile o la chiusura automatica è spenta. */
export function generalRequestCloseDecision(
  load: GeneralRequestLoad,
  thresholds: GeneralRequestThresholds = DEFAULT_GENERAL_REQUEST_THRESHOLDS,
): { trigger: Exclude<GeneralRequestCloseTrigger, "MANUAL">; reason: string } | null {
  if (!thresholds.autoCloseEnabled) return null;
  const weekly = weeklyPerProfessional(load);
  if (weekly > thresholds.maxWeeklyPerPro) {
    return {
      trigger: "LOAD",
      reason: `In media ${formatDecimal(weekly)} richieste generali a settimana per professionista (limite ${formatDecimal(thresholds.maxWeeklyPerPro)}).`,
    };
  }
  const rate = responseRate(load, thresholds.minMeasuredLeads);
  if (rate !== null && rate * 100 < thresholds.minResponsePercent) {
    return {
      trigger: "RESPONSES",
      reason: `Risponde solo il ${Math.round(rate * 100)}% dei professionisti (minimo ${thresholds.minResponsePercent}%).`,
    };
  }
  return null;
}

export function generalRequestCloseReason(
  load: GeneralRequestLoad,
  thresholds: GeneralRequestThresholds = DEFAULT_GENERAL_REQUEST_THRESHOLDS,
): string | null {
  return generalRequestCloseDecision(load, thresholds)?.reason ?? null;
}

/** Giorni minimi di chiusura prima di proporre una riapertura (docs/CHANGELOG.md §213). */
export const GENERAL_REQUESTS_REOPEN_MIN_DAYS = 7;
/** Chiusa per poche risposte: dopo questi giorni si propone di riprovare. */
export const GENERAL_REQUESTS_REOPEN_RETRY_DAYS = 30;

/**
 * Proposta di riaprire una zona chiusa in automatico (docs/CHANGELOG.md
 * §213), o null. Con le richieste generali chiuse il carico non si può più
 * misurare, quindi si usa la domanda che arriva comunque: le richieste
 * dirette della categoria in quella città dopo la chiusura. Una richiesta
 * generale va a tutti i professionisti della zona, quindi ognuno ne
 * riceverebbe circa quante ne arrivano in tutto.
 */
export function generalRequestReopenSuggestion(input: {
  trigger: GeneralRequestCloseTrigger;
  daysClosed: number;
  directRequestsSinceClose: number;
  thresholds: GeneralRequestThresholds;
}): string | null {
  const { trigger, daysClosed, directRequestsSinceClose, thresholds } = input;
  if (trigger === "MANUAL" || daysClosed < GENERAL_REQUESTS_REOPEN_MIN_DAYS) return null;
  if (trigger === "LOAD") {
    const perWeek = directRequestsSinceClose / (daysClosed / 7);
    if (perWeek > thresholds.maxWeeklyPerPro) return null;
    return `Da quando è chiusa arrivano circa ${formatDecimal(perWeek)} richieste a settimana in questa zona: riaprendo, ogni professionista ne riceverebbe più o meno altrettante (limite ${formatDecimal(thresholds.maxWeeklyPerPro)}).`;
  }
  if (daysClosed < GENERAL_REQUESTS_REOPEN_RETRY_DAYS) return null;
  return `Chiusa da ${Math.floor(daysClosed)} giorni per poche risposte: puoi riaprirla per provare se ora i professionisti rispondono di più.`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

/** Riga della pagina admin "Richieste generali". */
export type GeneralRequestZoneRow = {
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  load: GeneralRequestLoad;
  weeklyPerProfessional: number;
  responseRate: number | null;
  /** Chiusura in corso, se c'è. */
  block: {
    id: string;
    closedAt: string;
    automatic: boolean;
    reason: string;
    /** Proposta di riapertura, se il carico lo permette (docs/CHANGELOG.md §213). */
    reopenSuggestion: string | null;
  } | null;
  /** Riaperta a mano: il controllo automatico non la richiude fino a questa data. */
  keepOpenUntil: string | null;
};

export type GeneralRequestsAdminOverview = {
  globallyEnabled: boolean;
  thresholds: GeneralRequestThresholds;
  rows: GeneralRequestZoneRow[];
};

/** Chiusura a mano dall'area admin. */
export const closeGeneralRequestsSchema = z.object({
  categorySlug: professionalCategorySlugSchema,
  city: z.string().trim().min(2, "Indica la città.").max(100),
});
export type CloseGeneralRequestsInput = z.infer<typeof closeGeneralRequestsSchema>;
