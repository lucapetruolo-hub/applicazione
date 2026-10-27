import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Appuntamenti creati da global-setup, letti dalle prove. */
export type E2eData = {
  token: string;
  userId: string;
  /** Ora italiana attesa per ogni appuntamento, "AAAA-MM-GG HH:MM". */
  bookings: { id: string; label: string; wallClock: string }[];
  externalJob: { id: string; wallClock: string };
  /** Lavoro dal 3 al 5 novembre 2026, ogni giorno 08:00–17:00. */
  multiDayBookingId: string;
  /** Profilo pubblico di un altro professionista, con la barra "Richiedi un preventivo" (§386). */
  publicProfileId: string;
};

export const DATA_FILE = fileURLToPath(new URL("../.auth/data.json", import.meta.url));
export const STATE_FILE = fileURLToPath(new URL("../.auth/professionista.json", import.meta.url));

export function e2eData(): E2eData {
  return JSON.parse(readFileSync(DATA_FILE, "utf8")) as E2eData;
}
