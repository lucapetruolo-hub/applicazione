import { jobDayCount } from "./appointmentTime";

/**
 * Finestra di arrivo che vede il cliente (docs/changelog/2026-11-11-fasce-ampie.md):
 * un'ora dall'ora indicativa scritta dal professionista, mai oltre la fine
 * della fascia del primo giorno. Orari "di parete" in UTC come tutta l'agenda.
 */
export function arrivalWindowEnd(arrivalTime: string, startIso: string | null | undefined, endIso: string | null | undefined): string {
  return arrivalWindowEndBefore(arrivalTime, startIso && endIso && jobDayCount(startIso, endIso) === 1 ? endIso.slice(11, 16) : null);
}

/** Come `arrivalWindowEnd`, con la fine della fascia già come "HH:MM" (o `null`). */
export function arrivalWindowEndBefore(arrivalTime: string, slotEnd: string | null): string {
  const [h, m] = arrivalTime.split(":").map(Number) as [number, number];
  const plusHour = h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return slotEnd && slotEnd > arrivalTime && slotEnd < plusHour ? slotEnd : plusHour;
}

/** "tra le 10:00 e le 11:00" */
export function arrivalWindowText(arrivalTime: string, startIso: string | null | undefined, endIso: string | null | undefined): string {
  return `tra le ${arrivalTime} e le ${arrivalWindowEnd(arrivalTime, startIso, endIso)}`;
}
