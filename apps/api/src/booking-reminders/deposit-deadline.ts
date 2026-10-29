import { isLateCancellation } from "@professionisti/shared";
import { depositReminderTimes } from "../whatsapp/whatsapp-rules";

/** Quello che serve sapere del lavoro per dire se c'è un acconto da riavere. */
export type DepositDeadlineBooking = {
  scheduledAt: Date;
  cancellationNoticeHours: number | null;
  quote: { lateCancelKeepsDeposit: boolean } | null;
  jobPayment: {
    paymentMethod: string;
    paidEurCents: number;
    refundedEurCents: number;
    depositKeptAt: Date | null;
  } | null;
};

/** Campi da leggere con Prisma per `depositDeadline`. */
export const DEPOSIT_DEADLINE_SELECT = {
  scheduledAt: true,
  cancellationNoticeHours: true,
  quote: { select: { lateCancelKeepsDeposit: true } },
  jobPayment: {
    select: {
      paymentMethod: true,
      paidEurCents: true,
      refundedEurCents: true,
      depositKeptAt: true,
    },
  },
} as const;

/**
 * Fino a quando il cliente riavrebbe l'acconto annullando, se è ancora in
 * tempo: solo con l'acconto pagato online e un preventivo che lo lascia al
 * professionista per chi annulla tardi (docs/CHANGELOG.md §348).
 */
export function depositDeadline(
  booking: DepositDeadlineBooking,
  now: Date,
): Date | null {
  const payment = booking.jobPayment;
  const atStake =
    !!booking.quote?.lateCancelKeepsDeposit &&
    payment?.paymentMethod === "MANOVIA" &&
    !payment.depositKeptAt &&
    payment.paidEurCents - payment.refundedEurCents > 0 &&
    !isLateCancellation(
      booking.scheduledAt,
      booking.cancellationNoticeHours,
      now,
    );
  return atStake
    ? depositReminderTimes(
        booking.scheduledAt,
        booking.cancellationNoticeHours ?? 24,
      ).deadline
    : null;
}
