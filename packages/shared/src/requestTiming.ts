import { wallClockToday } from "./appointmentTime";

/**
 * Quando serve il lavoro, scelto dal cliente nella richiesta
 * (docs/CHANGELOG.md §344, scelta di Luca): "Oggi" rende la richiesta urgente,
 * "In settimana" e "Con calma" sono richieste normali, ma il professionista
 * vede la scelta. Null per le richieste di prima.
 */
export const REQUEST_TIMINGS = ["TODAY", "WEEK", "CALM"] as const;
export type RequestTiming = (typeof REQUEST_TIMINGS)[number];
export const REQUEST_TIMING_LABEL: Record<RequestTiming, string> = {
  TODAY: "Oggi",
  WEEK: "In settimana",
  CALM: "Con calma",
};

/**
 * "Quando ti serve?" ricavato dal giorno scelto in agenda, quando il cliente
 * sceglie un orario ma non la risposta: entro 7 giorni "In settimana", oltre
 * "Con calma". Mai "Oggi" (l'urgente si sceglie solo a mano). Il cliente lo
 * vede e lo cambia nel riepilogo; prima l'errore "Scegli quando ti serve."
 * bloccava chi aveva già scelto il giorno (prova da utente nuovo,
 * docs/changelog/2026-11-05-prova-utente-nuovo.md).
 */
export function timingForPreferredDate(date: string, now: Date = new Date()): RequestTiming {
  const days = (Date.parse(`${date}T00:00:00.000Z`) - wallClockToday(now).getTime()) / 86_400_000;
  return days <= 7 ? "WEEK" : "CALM";
}
