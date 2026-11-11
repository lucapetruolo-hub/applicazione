import { jobDayCount } from "@professionisti/shared";

/**
 * Ora indicativa di arrivo dentro la fascia del preventivo
 * (docs/changelog/2026-11-11-fasce-ampie.md): serve una fascia con fine e
 * l'ora deve cadere dentro la fascia del primo giorno. Orari "di parete" in
 * UTC, come tutta l'agenda. `null` = va bene.
 */
export function arrivalTimeProblem(startIso: string, endIso: string | undefined, arrivalTime: string | null | undefined): string | null {
  if (!arrivalTime) return null;
  if (!endIso) return "Per l'ora di arrivo indica anche l'ora di fine della fascia.";
  const from = startIso.slice(11, 16);
  const to = jobDayCount(startIso, endIso) === 1 ? endIso.slice(11, 16) : null;
  if (arrivalTime < from || (to !== null && arrivalTime >= to)) return "L'ora di arrivo deve cadere dentro la fascia scelta.";
  return null;
}
