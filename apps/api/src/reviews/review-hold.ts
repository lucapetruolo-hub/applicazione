import type { PrismaClient } from "@professionisti/database";
import {
  REVIEW_HOLD_NEW_CLIENT_HOURS,
  emailMailbox,
  type ReviewHoldReason,
} from "@professionisti/shared";
import { normalizeAddress, normalizePhone } from "../admin/user-signals";

type Address = {
  street: string | null;
  houseNumber: string | null;
  city: string | null;
};
type Side = {
  email: string | null;
  phones: (string | null)[];
  addresses: Address[];
};

export type ReviewHoldInput = {
  client: Side & { createdAt: Date };
  professional: Side;
  booking: {
    createdAt: Date;
    scheduledAt: Date;
    scheduledEndAt: Date | null;
    paidOnline: boolean;
  };
  now: Date;
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * Perché una recensione nuova va controllata prima di pubblicarla (collaudo
 * P-01): stesso telefono, indirizzo o casella email tra chi la scrive e chi la
 * riceve; lavoro fissato a un orario già passato; cliente appena iscritto con
 * il pagamento diretto, che non lascia traccia di soldi. Vuoto = si pubblica.
 */
export function reviewHoldReasons(input: ReviewHoldInput): ReviewHoldReason[] {
  const reasons: ReviewHoldReason[] = [];
  const phones = (side: Side) =>
    new Set(
      side.phones.map(normalizePhone).filter((v): v is string => v !== null),
    );
  const addresses = (side: Side) =>
    new Set(
      side.addresses
        .map((a) => normalizeAddress(a.street, a.houseNumber, a.city))
        .filter((v): v is string => v !== null),
    );
  const overlap = (a: Set<string>, b: Set<string>) =>
    [...a].some((v) => b.has(v));

  if (overlap(phones(input.client), phones(input.professional)))
    reasons.push("SAME_PHONE");
  if (overlap(addresses(input.client), addresses(input.professional)))
    reasons.push("SAME_ADDRESS");
  const clientMailbox = emailMailbox(input.client.email);
  if (clientMailbox && clientMailbox === emailMailbox(input.professional.email))
    reasons.push("SAME_EMAIL");
  const end = input.booking.scheduledEndAt ?? input.booking.scheduledAt;
  if (input.booking.createdAt.getTime() > end.getTime())
    reasons.push("BOOKED_AFTER_APPOINTMENT");
  const clientHours =
    (input.now.getTime() - input.client.createdAt.getTime()) / HOUR_MS;
  if (!input.booking.paidOnline && clientHours < REVIEW_HOLD_NEW_CLIENT_HOURS)
    reasons.push("NEW_CLIENT_DIRECT");
  return reasons;
}

const USER_FIELDS = {
  email: true,
  phone: true,
  phoneVerifiedNumber: true,
  street: true,
  houseNumber: true,
  city: true,
  createdAt: true,
} as const;

/** Legge i dati che servono a `reviewHoldReasons` per una prenotazione. Restano fuori gli account di prova. */
export async function loadReviewHoldReasons(
  prisma: PrismaClient,
  bookingId: string,
  now: Date = new Date(),
): Promise<ReviewHoldReason[]> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      createdAt: true,
      scheduledAt: true,
      scheduledEndAt: true,
      recipientPhone: true,
      street: true,
      houseNumber: true,
      city: true,
      jobPayment: { select: { paymentMethod: true, paidEurCents: true } },
      client: { select: { ...USER_FIELDS, testAccountAt: true } },
      quote: {
        select: {
          guidedRequest: {
            select: {
              recipientPhone: true,
              address: true,
              houseNumber: true,
              city: true,
            },
          },
        },
      },
      professionalProfile: {
        select: { user: { select: { ...USER_FIELDS, testAccountAt: true } } },
      },
    },
  });
  if (!booking) return [];
  const client = booking.client;
  const pro = booking.professionalProfile.user;
  // Gli account di prova usano gli stessi dati di proposito (come i segnali in Admin).
  if (client.testAccountAt || pro.testAccountAt) return [];
  const request = booking.quote?.guidedRequest;
  return reviewHoldReasons({
    client: {
      email: client.email,
      createdAt: client.createdAt,
      phones: [
        client.phone,
        client.phoneVerifiedNumber,
        booking.recipientPhone,
        request?.recipientPhone ?? null,
      ],
      addresses: [
        {
          street: client.street,
          houseNumber: client.houseNumber,
          city: client.city,
        },
        {
          street: booking.street,
          houseNumber: booking.houseNumber,
          city: booking.city,
        },
        ...(request
          ? [
              {
                street: request.address,
                houseNumber: request.houseNumber,
                city: request.city,
              },
            ]
          : []),
      ],
    },
    professional: {
      email: pro.email,
      phones: [pro.phone, pro.phoneVerifiedNumber],
      addresses: [
        { street: pro.street, houseNumber: pro.houseNumber, city: pro.city },
      ],
    },
    booking: {
      createdAt: booking.createdAt,
      scheduledAt: booking.scheduledAt,
      scheduledEndAt: booking.scheduledEndAt,
      // Soldi davvero passati dal sito (acconto o saldo): costano al truffatore la trattenuta e lasciano una traccia.
      paidOnline:
        booking.jobPayment?.paymentMethod === "MANOVIA" &&
        booking.jobPayment.paidEurCents > 0,
    },
    now,
  });
}
