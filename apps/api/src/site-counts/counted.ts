import { hasLaunched, launchDate } from "../subscriptions/subscription-rules";

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/**
 * Da quando contano i numeri (docs/CHANGELOG.md §395, richiesta di Luca): dal
 * giorno del lancio (`LAUNCH_DATE`), così le prove fatte prima non si
 * mescolano ai dati veri. Niente si cancella: i dati di prima restano nel
 * database ma non entrano nei conti. Prima del lancio (o senza data) `null`:
 * si vede tutto, per poter provare le pagine.
 */
export function countingFrom(now: Date = new Date(), launch: Date | null = launchDate()): Date | null {
  return hasLaunched(now, launch) ? launch : null;
}

/** L'inizio di un periodo, mai prima del lancio. */
export function sinceLaunch(since: Date, from: Date | null): Date {
  return from && from.getTime() > since.getTime() ? from : since;
}

/**
 * Lo stesso per i contatori salvati per giorno (mezzanotte UTC): il lancio è
 * la mezzanotte di Roma, cioè la sera prima in UTC, quindi il primo giorno
 * contato è la data del lancio.
 */
export function dayFrom(from: Date | null): Date | null {
  if (!from) return null;
  const day = new Date(from.getTime() + HALF_DAY_MS);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
}

export function daySinceLaunch(day: Date, from: Date | null): Date {
  return sinceLaunch(day, dayFrom(from));
}

/** Persona che conta nei numeri: non un account di prova (§395). */
export const COUNTED_USER = { testAccountAt: null };
