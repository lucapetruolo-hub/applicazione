"use client";

import type { ExternalJob, ProfessionalBooking } from "@professionisti/shared";
import { brand } from "@professionisti/ui";
import { REQUEST_STAGE_STYLE } from "@/lib/requestStage";

// `date` (ISO, YYYY-MM-DD) è ora il comportamento di default per una nuova
// fascia (richiesta esplicita dell'utente: vale solo per quella data, non
// più per ogni <dayOfWeek> per sempre) — `null`/assente solo per le fasce
// ricorrenti create prima di questa funzionalità.
// Capienza indipendente per modalità (richiesta esplicita dell'utente: due
// caselle "A domicilio"/"Online", almeno una obbligatoria, con capienza
// separata) — homeMax/onlineMax valorizzati solo quando il rispettivo
// allows* è vero.
export type SlotDraft = {
  id?: string;
  dayOfWeek: number;
  date: string | null;
  start: string;
  end: string;
  allowsHome: boolean;
  allowsOnline: boolean;
  homeMax: number | null;
  onlineMax: number | null;
  hasUpcomingBooking?: boolean;
};
// dayOfWeek segue date.getUTCDay(): 0=domenica...6=sabato, stessa convenzione
// usata in tutto il modulo agenda.
export const WEEKDAY_FULL_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export function slotsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Una fascia è "generica" (bordo tratteggiato ottone) se una delle due capienze indipendenti supera 1. */
export function isSlotGeneric(slot: SlotDraft): boolean {
  return (slot.homeMax ?? 0) > 1 || (slot.onlineMax ?? 0) > 1;
}

// Richiesta esplicita dell'utente: "colora le caselle degli appuntamento in
// base ai colori che sono stati usati per le schede in richieste ricevute"
// — riusa `REQUEST_STAGE_STYLE` (packages/lib/requestStage.ts, unica fonte
// di verità, prima locale a `/dashboard/richieste`) invece dei token
// `brand.*` usati fin qui, mappando ogni `BookingStatus` sullo stadio con lo
// stesso significato pratico: CONFIRMED→accettata (verde), COMPLETED→
// completata (turchese), CANCELED→annullata (rosso firebrick). PENDING
// (prenotazione creata ma non ancora confermata dal professionista — solo
// dal flusso di prenotazione diretta, dormiente da CLAUDE.md §20) riusa lo
// stesso giallo "in attesa" — stessa semantica "in attesa di un'azione".
// NO_SHOW non ha uno stadio dedicato in "richieste ricevute": riusa lo
// stesso rosso di `annullata` (entrambi "il lavoro non si è svolto").
export const BOOKING_STATUS_COLOR: Record<ProfessionalBooking["status"], string> = {
  PENDING: REQUEST_STAGE_STYLE.in_attesa.border,
  CONFIRMED: REQUEST_STAGE_STYLE.accettata.border,
  COMPLETED: REQUEST_STAGE_STYLE.completata.border,
  CANCELED: REQUEST_STAGE_STYLE.annullata.border,
  NO_SHOW: REQUEST_STAGE_STYLE.annullata.border,
};

// Lavori presi al di fuori della piattaforma (richiesta esplicita
// dell'utente), mostrati insieme alle Booking reali nello stesso
// calendario "Prenotazioni" — bordo tratteggiato (stesso principio già in
// uso per le fasce generiche dell'agenda) per restare visivamente distinti
// da un impegno nato da un preventivo accettato.
export const EXTERNAL_JOB_STATUS_COLOR: Record<ExternalJob["status"], string> = {
  SCHEDULED: brand.grafite70,
  COMPLETED: brand.verificato,
  CANCELED: brand.urgenza,
};

// Data/orario di un preventivo inviato ma non ancora accettato dal cliente
// (richiesta esplicita dell'utente) — colore ottone, coerente con lo stesso
// significato "in attesa di una decisione" già usato altrove nel prodotto
// (es. Booking PENDING).
export const PENDING_QUOTE_COLOR = brand.ottone;

// Etichette italiane per stato — usate sia in UI (lista annuale/risultati di
// ricerca) sia come testo indicizzato dalla ricerca full-text (così cercare
// "confermat" trova le prenotazioni confermate, non solo un nome cliente).
export const AGENDA_BOOKING_STATUS_LABEL: Record<ProfessionalBooking["status"], string> = {
  PENDING: "In attesa di conferma",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Cliente non presentato",
};
export const AGENDA_EXTERNAL_JOB_STATUS_LABEL: Record<ExternalJob["status"], string> = {
  SCHEDULED: "Programmato",
  COMPLETED: "Completato",
  CANCELED: "Annullato",
};

/**
 * Riga unificata per la lista annuale e per i risultati di ricerca
 * (richiesta esplicita dell'utente, entrambe): stessa forma per Booking,
 * ExternalJob e preventivo "in attesa", con `searchText` precalcolato —
 * concatenazione minuscola di ogni campo pertinente, così "qualsiasi
 * prenotazione dove in qualsiasi campo c'è la parola" (richiesta letterale
 * dell'utente) funziona con un solo `.includes()` invece di controllare
 * campo per campo ad ogni digitazione.
 */
export type AgendaListItem = {
  key: string;
  date: Date;
  timeLabel: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusColor: string;
  dashed: boolean;
  searchText: string;
  onPress: () => void;
};

export function formatAgendaTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (!endIso) return start;
  return `${start}–${new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}
