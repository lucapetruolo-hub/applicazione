import type { CurrentUser } from "@professionisti/api-client";
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
    if (Date.now() - new Date(copy.savedAt).getTime() > MAX_AGE_MS) {
      // Copia scaduta: si cancella, non resta sul telefono (P2 della verifica, §293).
      window.localStorage.removeItem(KEY);
      return null;
    }
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

/**
 * Chi è entrato, salvato insieme alla copia dell'agenda (R1 della verifica,
 * §293): senza rete il sito non può chiedere al server chi sei e mostrava
 * "Accedi" al posto degli appuntamenti. Stessa durata della copia, e si
 * cancella all'uscita o quando il server dice che la sessione non vale più.
 */
const USER_KEY = "agenda-offline-user-v1";

export function saveOfflineUser(user: CurrentUser): void {
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify({ savedAt: new Date().toISOString(), user }));
  } catch {
    // Spazio pieno o navigazione privata: niente copia.
  }
}

export function readOfflineUser(): CurrentUser | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt: string; user: CurrentUser };
    if (!saved.user || Date.now() - new Date(saved.savedAt).getTime() > MAX_AGE_MS) {
      window.localStorage.removeItem(USER_KEY);
      return null;
    }
    return saved.user;
  } catch {
    return null;
  }
}

export function clearOfflineUser(): void {
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // niente da fare
  }
}
