import { wallClockNow } from "./appointmentTime";

/**
 * Preavviso per annullare scelto dal professionista (docs/CHANGELOG.md §345,
 * decisione dell'utente): 24 ore, 48 ore o 3 giorni. Si copia sul lavoro
 * quando il cliente accetta, così cambiarlo dopo non tocca i lavori già
 * prenotati. Oggi è un'indicazione: il cliente può annullare fino all'inizio
 * dell'appuntamento, e un annullamento dentro il preavviso resta segnato.
 * Cosa succede all'acconto in quel caso lo decide il parere dell'avvocato.
 */
export const CANCELLATION_NOTICE_OPTIONS = [24, 48, 72] as const;
export type CancellationNoticeHours = (typeof CANCELLATION_NOTICE_OPTIONS)[number];
export const DEFAULT_CANCELLATION_NOTICE_HOURS: CancellationNoticeHours = 24;

export function isCancellationNoticeHours(value: unknown): value is CancellationNoticeHours {
  return CANCELLATION_NOTICE_OPTIONS.includes(value as CancellationNoticeHours);
}

/** "24 ore", "48 ore", "3 giorni". */
export function cancellationNoticeLabel(hours: number | null | undefined): string {
  const h = hours ?? DEFAULT_CANCELLATION_NOTICE_HOURS;
  return h % 24 === 0 && h > 48 ? `${h / 24} giorni` : `${h} ore`;
}

/** Vero se l'annullamento cade dentro il preavviso (orari "di parete" italiani, come scheduledAt). */
export function isLateCancellation(scheduledAt: Date | string, hours: number | null | undefined, now: Date = new Date()): boolean {
  const start = new Date(scheduledAt).getTime();
  return start - wallClockNow(now).getTime() < (hours ?? DEFAULT_CANCELLATION_NOTICE_HOURS) * 60 * 60_000;
}
