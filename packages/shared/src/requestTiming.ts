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
