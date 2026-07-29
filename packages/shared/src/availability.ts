/**
 * Agenda/disponibilità settimanale del professionista (CLAUDE.md §8, agenda
 * digitale come feature core SaaS). `dayOfWeek` segue `Date.getUTCDay()`
 * (0=domenica...6=sabato) per confrontare senza conversioni la disponibilità
 * ricorrente con le prenotazioni reali lato server.
 */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Lunedì" },
  { value: 2, label: "Martedì" },
  { value: 3, label: "Mercoledì" },
  { value: 4, label: "Giovedì" },
  { value: 5, label: "Venerdì" },
  { value: 6, label: "Sabato" },
  { value: 0, label: "Domenica" },
];

export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAYS.find((d) => d.value === dayOfWeek)?.label ?? "";
}

/** Fascia oraria ricorrente impostata dal professionista in /dashboard/agenda. */
export type AvailabilitySlotItem = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /**
   * Capienza della fascia: 1 (default) = fascia esatta, un solo impegno
   * possibile. > 1 = fascia "generica" — più clienti possono inviare una
   * richiesta di preventivo nella stessa finestra invece di occupare un
   * orario preciso (vedi GuidedRequest.preferredDate/preferredTimeSlot).
   */
  maxBookings: number;
  /**
   * True se nei prossimi 14 giorni (stessa finestra di getPublicAgenda)
   * esiste già almeno una prenotazione reale (fasce esatte) o una richiesta
   * di preventivo (fasce generiche) che cade in questa fascia ricorrente.
   * Usato in /dashboard/agenda per avvisare prima di rimuovere/ridurre un
   * orario già impegnato.
   */
  hasUpcomingBooking: boolean;
};

/**
 * Fascia oraria proiettata su una data reale. Per le fasce esatte
 * (maxBookings === 1) bookedCount vale 0 o 1 — stesso significato del
 * precedente campo booleano `booked`. Per le fasce generiche
 * (maxBookings > 1) conta le richieste di preventivo già inviate per
 * quella data+fascia.
 */
export type ProfessionalAgendaSlot = {
  startTime: string;
  endTime: string;
  maxBookings: number;
  bookedCount: number;
};

export type ProfessionalAgendaDay = {
  /** Data ISO (YYYY-MM-DD). */
  date: string;
  dayOfWeek: number;
  slots: ProfessionalAgendaSlot[];
};

/** Risposta di GET /professionals/:id/agenda: giorni + se le fasce libere sono prenotabili direttamente. */
export type ProfessionalAgenda = {
  bookableAgenda: boolean;
  days: ProfessionalAgendaDay[];
};

/** Risposta di GET/PUT /professionals/me/availability. */
export type MyAvailability = {
  slots: AvailabilitySlotItem[];
  bookableAgenda: boolean;
  /** Date ISO (YYYY-MM-DD) da oggi in poi in cui il professionista ha chiuso per quel giorno (ferie, festività, imprevisto). */
  exceptionDates: string[];
};
