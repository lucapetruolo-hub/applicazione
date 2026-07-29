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
   * True se nei prossimi 14 giorni (stessa finestra di getPublicAgenda)
   * esiste già almeno una prenotazione reale che cade in questa fascia
   * ricorrente. Usato in /dashboard/agenda per avvisare prima di
   * rimuovere/ridurre un orario che un cliente ha già prenotato.
   */
  hasUpcomingBooking: boolean;
};

/** Fascia oraria proiettata su una data reale, con lo stato di prenotazione. */
export type ProfessionalAgendaSlot = {
  startTime: string;
  endTime: string;
  booked: boolean;
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
