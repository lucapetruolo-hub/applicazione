/** Appuntamenti di prova, in ora italiana (docs/CHANGELOG.md §304). */
export const BOOKING_CASES = [
  { label: "sabato prima del cambio d'ora di ottobre", wallClock: "2026-10-24 09:00", end: "2026-10-24 10:30" },
  { label: "lunedì dopo il cambio d'ora di ottobre", wallClock: "2026-10-26 09:00", end: "2026-10-26 10:30" },
  { label: "sera tardi", wallClock: "2026-10-26 23:30", end: "2026-10-26 23:45" },
  { label: "venerdì prima del cambio d'ora di marzo", wallClock: "2027-03-26 09:00", end: "2027-03-26 10:00" },
  { label: "lunedì dopo il cambio d'ora di marzo", wallClock: "2027-03-29 09:00", end: "2027-03-29 10:00" },
] as const;
