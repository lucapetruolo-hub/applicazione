import type { BookingDateChange } from "@professionisti/shared";

/**
 * Altra data in sospeso per un appuntamento già fissato: sta sul preventivo
 * accettato come ogni proposta (docs/changelog/2026-10-28-promemoria-whatsapp.md).
 * La nota è di chi l'ha proposta.
 */
export function bookingDateChange(
  booking: { status: string; rescheduleRequestedAt: Date | null; rescheduleProposedBy: string | null },
  quote: { clientProposedDate: Date | null; clientProposedEndDate: Date | null; clientProposedNote: string | null; professionalCounterNote: string | null } | null,
): BookingDateChange | null {
  if (booking.status !== "CONFIRMED" || !booking.rescheduleRequestedAt || !quote?.clientProposedDate) return null;
  const proposedBy = booking.rescheduleProposedBy === "PROFESSIONAL" ? "PROFESSIONAL" : "CLIENT";
  return {
    start: quote.clientProposedDate.toISOString(),
    end: quote.clientProposedEndDate?.toISOString() ?? null,
    note: proposedBy === "PROFESSIONAL" ? quote.professionalCounterNote : quote.clientProposedNote,
    proposedBy,
    requestedAt: booking.rescheduleRequestedAt.toISOString(),
  };
}
