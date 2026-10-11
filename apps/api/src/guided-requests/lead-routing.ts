/**
 * Tempi delle richieste di preventivo (docs/CHANGELOG.md §209, decisione
 * dell'utente): una richiesta generale va a tutti i professionisti
 * compatibili e nessuno ha una scadenza per rispondere. L'unico tempo che
 * conta è l'inoltro di una richiesta diretta (§208). Funzioni pure,
 * testate in `lead-routing.test.ts`.
 */

/** Fascia in cui scorre il tempo dell'inoltro delle richieste normali, ora italiana. */
export const RESPONSE_DAY_START_HOUR = 8;
export const RESPONSE_DAY_END_HOUR = 21;

const ROME_HOUR_FORMAT = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" });

function romeHour(date: Date): number {
  return Number(ROME_HOUR_FORMAT.format(date));
}

/**
 * Aggiunge `hours` ore contando solo il tempo tra le 8 e le 21 (ora
 * italiana, ora legale inclusa): una richiesta arrivata alle 23 non scade
 * alle 3 di notte mentre il professionista dorme, ma alle 12 del mattino
 * dopo. Passo di 5 minuti: preciso abbastanza, al massimo poche centinaia
 * di iterazioni.
 */
export function addDaytimeHours(from: Date, hours: number): Date {
  const stepMs = 5 * 60_000;
  let remaining = Math.round((hours * 60) / 5);
  let t = from.getTime();
  // Se si parte di notte, il conteggio inizia alle 8.
  while (remaining > 0) {
    t += stepMs;
    const h = romeHour(new Date(t - stepMs / 2));
    if (h >= RESPONSE_DAY_START_HOUR && h < RESPONSE_DAY_END_HOUR) remaining -= 1;
  }
  return new Date(t);
}

/**
 * Richiesta diretta a un professionista scelto dal cliente (docs/CHANGELOG.md
 * §208, decisione dell'utente): il professionista scelto non ha scadenza per
 * rispondere. Se il cliente lascia spuntata la casella di inoltro, dopo 60
 * minuti (urgente, di giorno e di notte) o 6 ore contate dalle 8 alle 21
 * (normale) senza un suo preventivo la richiesta va anche ad altri
 * professionisti simili.
 */
export const DIRECT_FORWARD_URGENT_MINUTES = 60;
export const DIRECT_FORWARD_STANDARD_HOURS = 6;

export function computeDirectForwardAt(isUrgent: boolean, now: Date = new Date()): Date {
  return isUrgent ? new Date(now.getTime() + DIRECT_FORWARD_URGENT_MINUTES * 60_000) : addDaytimeHours(now, DIRECT_FORWARD_STANDARD_HOURS);
}
