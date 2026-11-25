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

/**
 * Orari di arrivo che il professionista può scegliere nel preventivo
 * (docs/changelog/2026-11-25-orari-di-arrivo-validi.md): uno all'ora
 * dall'inizio della fascia, solo dentro la fascia (prima della fine), come
 * controlla il server (`arrivalTimeProblem`). Un orario già salvato dentro la
 * fascia ma fuori dal passo di un'ora (preventivo vecchio, "10:15") resta
 * tra le scelte, così modificando il preventivo non si perde.
 */
export function arrivalTimeChoices(start: string, end: string, current?: string | null): string[] {
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const from = toMinutes(start);
  const to = toMinutes(end);
  const choices: string[] = [];
  for (let minutes = from; minutes < to; minutes += 60) {
    choices.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  if (current && /^\d\d:\d\d$/.test(current) && current >= start && current < end && !choices.includes(current)) {
    choices.push(current);
    choices.sort();
  }
  return choices;
}
