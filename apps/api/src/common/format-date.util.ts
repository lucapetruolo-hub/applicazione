import { formatJobDays } from "@professionisti/shared";

/**
 * Formatta una data+fascia oraria per il testo di un evento della
 * cronologia (TimelineService) — stessa convenzione "wall clock UTC" già
 * in uso in tutto il modulo agenda (mai convertita al fuso del browser,
 * vedi apps/web/src/lib/calendarDates.ts): qui il messaggio è generato
 * lato server e persistito come testo, deve restare identico a prescindere
 * dal fuso orario di chi lo legge in seguito.
 */
export function formatSlotForTimeline(start: Date, end: Date | null): string {
  // Lavoro su più giorni (docs/CHANGELOG.md §310): "dal 4 al 6 novembre, 08:00–17:00 ogni giorno".
  const days = end ? formatJobDays(start, end) : null;
  if (days && end) return `${days}, ${start.toISOString().slice(11, 16)}–${end.toISOString().slice(11, 16)} ogni giorno`;
  const dateStr = start.toISOString().slice(0, 10).split("-").reverse().join("/");
  const startTime = start.toISOString().slice(11, 16);
  if (!end) return `${dateStr} ${startTime}`;
  const endTime = end.toISOString().slice(11, 16);
  return `${dateStr} ${startTime}–${endTime}`;
}
