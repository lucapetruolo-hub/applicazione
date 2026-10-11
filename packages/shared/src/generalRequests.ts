import { z } from "zod";
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

/** Oltre questa media di richieste generali a settimana per professionista, la categoria in quella città si chiude. */
export const GENERAL_REQUESTS_MAX_WEEKLY_PER_PRO = 10;
/** Sotto questa quota di professionisti che rispondono, la categoria in quella città si chiude. */
export const GENERAL_REQUESTS_MIN_RESPONSE_RATE = 1 / 3;
/** Richieste ricevute (da almeno 48 ore) necessarie prima di giudicare la quota di risposte. */
export const GENERAL_REQUESTS_MIN_MEASURED_LEADS = 20;
/** Finestra su cui si misura il carico, in giorni. */
export const GENERAL_REQUESTS_WINDOW_DAYS = 14;
/** Dopo una riapertura a mano, il controllo automatico non la richiude per questi giorni. */
export const GENERAL_REQUESTS_KEEP_OPEN_DAYS = 30;

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
export function responseRate(load: GeneralRequestLoad): number | null {
  if (load.measuredLeads < GENERAL_REQUESTS_MIN_MEASURED_LEADS) return null;
  return load.respondedLeads / load.measuredLeads;
}

/** Motivo per chiudere la categoria in quella città, o null se il carico è accettabile. */
export function generalRequestCloseReason(load: GeneralRequestLoad): string | null {
  const weekly = weeklyPerProfessional(load);
  if (weekly > GENERAL_REQUESTS_MAX_WEEKLY_PER_PRO) {
    return `In media ${weekly.toFixed(1).replace(".", ",")} richieste generali a settimana per professionista (limite ${GENERAL_REQUESTS_MAX_WEEKLY_PER_PRO}).`;
  }
  const rate = responseRate(load);
  if (rate !== null && rate < GENERAL_REQUESTS_MIN_RESPONSE_RATE) {
    return `Risponde solo il ${Math.round(rate * 100)}% dei professionisti (minimo ${Math.round(GENERAL_REQUESTS_MIN_RESPONSE_RATE * 100)}%).`;
  }
  return null;
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
  } | null;
  /** Riaperta a mano: il controllo automatico non la richiude fino a questa data. */
  keepOpenUntil: string | null;
};

export type GeneralRequestsAdminOverview = {
  globallyEnabled: boolean;
  rows: GeneralRequestZoneRow[];
};

/** Chiusura a mano dall'area admin. */
export const closeGeneralRequestsSchema = z.object({
  categorySlug: professionalCategorySlugSchema,
  city: z.string().trim().min(2, "Indica la città.").max(100),
});
export type CloseGeneralRequestsInput = z.infer<typeof closeGeneralRequestsSchema>;
