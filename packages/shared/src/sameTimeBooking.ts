/**
 * Due lavori dello stesso mestiere alla stessa ora (collaudo I-11): il
 * cliente accettava il preventivo di un secondo idraulico per la stessa
 * fascia senza nessun avviso, e il primo partiva per niente. Avviso, non
 * blocco: un cliente può avere davvero due lavori insieme.
 */
export type SameTimeBookingCandidate = {
  businessName: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
};

const HOUR_MS = 60 * 60 * 1000;

/** Fine della fascia, o un'ora dopo l'inizio se non è nota. */
function endOf(start: string, end: string | null): number {
  return end ? new Date(end).getTime() : new Date(start).getTime() + HOUR_MS;
}

/** Il primo appuntamento che si sovrappone alla fascia proposta, se c'è. */
export function sameTimeBooking(
  slot: { start: string; end: string | null },
  bookings: readonly SameTimeBookingCandidate[],
): SameTimeBookingCandidate | null {
  const start = new Date(slot.start).getTime();
  const end = endOf(slot.start, slot.end);
  return (
    bookings.find(
      (b) =>
        new Date(b.scheduledAt).getTime() < end &&
        endOf(b.scheduledAt, b.scheduledEndAt) > start,
    ) ?? null
  );
}
