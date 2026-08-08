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

/** Fascia oraria impostata dal professionista in /dashboard/agenda. */
export type AvailabilitySlotItem = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /**
   * Data ISO (YYYY-MM-DD) esatta a cui questa fascia è legata — nuovo
   * comportamento di default (richiesta esplicita dell'utente): una fascia
   * aggiunta vale solo per quella data, non più per ogni `dayOfWeek` per
   * sempre. `null`/assente solo per le fasce ricorrenti create prima di
   * questa funzionalità (comportamento storico, non più creabile dalla UI).
   */
  date: string | null;
  /**
   * Tipo/i di intervento accettati su questa fascia (richiesta esplicita
   * dell'utente: due caselle "A domicilio"/"Online", almeno una
   * obbligatoria) — con capienza INDIPENDENTE per tipo:
   * `homeMaxBookings`/`onlineMaxBookings` valorizzati solo quando il
   * rispettivo `allowsHome`/`allowsOnline` è vero. 1 (default) su un tipo
   * = fascia "esatta" per quel tipo, un solo impegno possibile. > 1 =
   * fascia "generica" per quel tipo — più clienti possono inviare una
   * richiesta di preventivo nella stessa finestra invece di occupare un
   * orario preciso (vedi GuidedRequest.preferredDate/preferredTimeSlot).
   */
  allowsHome: boolean;
  allowsOnline: boolean;
  homeMaxBookings: number | null;
  onlineMaxBookings: number | null;
  /**
   * True se nei prossimi 14 giorni (stessa finestra di getPublicAgenda)
   * esiste già almeno una prenotazione reale o una richiesta di preventivo
   * (di uno qualunque dei due tipi) che cade in questa fascia ricorrente.
   * Usato in /dashboard/agenda per avvisare prima di rimuovere/ridurre un
   * orario già impegnato — non distingue per tipo, un avviso generico
   * basta per lo scopo (evitare di cancellare una fascia già impegnata).
   */
  hasUpcomingBooking: boolean;
};

/**
 * Fascia oraria proiettata su una data reale. Capienza e conteggio
 * prenotazioni sono per tipo (home/online), indipendenti — vedi
 * AvailabilitySlotItem sopra per il motivo. `home`/`online` sono `null`
 * quando quel tipo non è offerto su questa fascia (`allowsHome`/
 * `allowsOnline` false), mai un oggetto con capienza 0.
 */
export type ProfessionalAgendaSlotMode = {
  maxBookings: number;
  bookedCount: number;
};

export type ProfessionalAgendaSlot = {
  startTime: string;
  endTime: string;
  home: ProfessionalAgendaSlotMode | null;
  online: ProfessionalAgendaSlotMode | null;
};

export type ProfessionalAgendaDay = {
  /** Data ISO (YYYY-MM-DD). */
  date: string;
  dayOfWeek: number;
  slots: ProfessionalAgendaSlot[];
};

/** Risposta di GET /professionals/:id/agenda. */
export type ProfessionalAgenda = {
  days: ProfessionalAgendaDay[];
};

/** Risposta di GET/PUT /professionals/me/availability. */
export type MyAvailability = {
  slots: AvailabilitySlotItem[];
  /** Date ISO (YYYY-MM-DD) da oggi in poi in cui il professionista ha chiuso per quel giorno (ferie, festività, imprevisto). */
  exceptionDates: string[];
};
