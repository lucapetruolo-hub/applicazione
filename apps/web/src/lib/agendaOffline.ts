import type { ExternalJob, ProfessionalBooking } from "@professionisti/shared";

/**
 * Agenda anche senza rete (docs/CHANGELOG.md §288, scelto dall'utente): in
 * cantiere o in cantina la connessione salta. Ad ogni caricamento riuscito
 * si salva sul telefono una copia degli appuntamenti; se il caricamento non
 * riesce si mostra quella, con l'ora dell'ultimo aggiornamento. Solo
 * lettura: le azioni chiedono comunque la rete. La copia è legata
 * all'account e si cancella all'uscita (vedi `clearAgendaOffline`).
 */
const KEY = "agenda-offline-v1";
/** Oltre una settimana la copia non serve più. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type AgendaOfflineCopy = {
  userId: string;
  savedAt: string;
  bookings: ProfessionalBooking[];
  externalJobs: ExternalJob[];
};

export function saveAgendaOffline(userId: string, bookings: ProfessionalBooking[], externalJobs: ExternalJob[]): void {
  try {
    const copy: AgendaOfflineCopy = { userId, savedAt: new Date().toISOString(), bookings, externalJobs };
    window.localStorage.setItem(KEY, JSON.stringify(copy));
  } catch {
    // Spazio pieno o navigazione privata: semplicemente niente copia.
  }
}

export function readAgendaOffline(userId: string): AgendaOfflineCopy | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const copy = JSON.parse(raw) as AgendaOfflineCopy;
    if (copy.userId !== userId || !Array.isArray(copy.bookings) || !Array.isArray(copy.externalJobs)) return null;
    if (Date.now() - new Date(copy.savedAt).getTime() > MAX_AGE_MS) return null;
    return copy;
  } catch {
    return null;
  }
}

export function clearAgendaOffline(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // niente da fare
  }
}
