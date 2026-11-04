import { PROBLEM_DESCRIPTION_MAX } from "@professionisti/shared";

/**
 * Parametro dell'indirizzo con cui il profilo sa il problema scritto nella
 * ricerca: "Richiedi preventivo" parte con la stessa descrizione
 * (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md).
 */
export const PROBLEM_PROFILE_PARAM = "problema";

/**
 * Testo da mettere già in "Descrivi il lavoro": il problema scritto nella
 * ricerca, altrimenti la prestazione cercata (§398). Finisce con un punto e
 * uno spazio, così si continua a scrivere subito.
 */
export function requestDescription(problem: string | undefined, service: string | undefined): string | undefined {
  const text = (problem?.trim() || service?.trim() || "").slice(0, PROBLEM_DESCRIPTION_MAX - 2);
  if (!text) return undefined;
  return /[.!?]$/.test(text) ? `${text} ` : `${text}. `;
}

/** `&descrizione=…` per l'indirizzo di /preventivo, vuoto se non c'è niente da scrivere. */
export function requestDescriptionParam(problem: string | undefined, service: string | undefined): string {
  const text = requestDescription(problem, service);
  return text ? `&descrizione=${encodeURIComponent(text)}` : "";
}
