import type { Prisma, PrismaClient } from "@professionisti/database";
import { spansMultipleDays } from "@professionisti/shared";
import { slotAppliesOnDate } from "../common/availability.util";

/**
 * Impegni del professionista nell'agenda (docs/CHANGELOG.md §305): le
 * prenotazioni e i lavori presi fuori dalla piattaforma. Servono a decidere
 * quali fasce sono ancora libere per i clienti e se un nuovo lavoro si
 * sovrappone a uno già preso.
 *
 * Prima contava solo l'ora di inizio della prenotazione (un lavoro 09-12
 * lasciava libera la fascia 10-11) e i lavori esterni non contavano (D2 e
 * D3 della verifica, §304).
 *
 * Un lavoro su più giorni non occupa nulla (decisione dell'utente): compare
 * in agenda ogni giorno, ma il professionista può ricevere e accettare altri
 * lavori secondo gli orari che ha messo in agenda.
 */
export type Commitment = {
  scheduledAt: Date;
  scheduledEndAt?: Date | null;
  /** Modalità della prenotazione; un lavoro esterno occupa ogni modalità. */
  serviceMode?: string | null;
  external?: boolean;
};

/** Stati delle prenotazioni che occupano l'agenda: un annullamento libera la fascia da solo. */
export const AGENDA_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"] as const;
const AGENDA_EXTERNAL_STATUSES = ["SCHEDULED", "COMPLETED"] as const;

/**
 * Due impegni si sovrappongono se hanno un momento in comune. Senza orario
 * di fine (o con una fine non dopo l'inizio) l'impegno è un solo istante:
 * occupa l'intervallo in cui cade il suo inizio, come prima di §305.
 */
export function commitmentsOverlap(aStart: Date, aEnd: Date | null | undefined, bStart: Date, bEnd: Date | null | undefined): boolean {
  const as = aStart.getTime();
  const bs = bStart.getTime();
  const ae = aEnd && aEnd.getTime() > as ? aEnd.getTime() : as;
  const be = bEnd && bEnd.getTime() > bs ? bEnd.getTime() : bs;
  if (as === bs) return true;
  if (as < bs) return bs < ae;
  return as < be;
}

function occupies(commitment: Commitment, mode: "HOME" | "ONLINE" | undefined): boolean {
  if (spansMultipleDays(commitment.scheduledAt, commitment.scheduledEndAt)) return false;
  return !mode || commitment.external === true || commitment.serviceMode === mode;
}

/**
 * Quanti impegni toccano questa data+fascia: un lavoro lungo occupa tutte
 * le fasce che attraversa.
 *
 * `mode` opzionale: conta solo le prenotazioni di quel tipo, perché la
 * capienza a domicilio e online è indipendente (CLAUDE.md §22); i lavori
 * esterni contano sempre.
 */
export function countBookingsInSlot(commitments: Commitment[], dateStr: string, startTime: string, endTime: string, mode?: "HOME" | "ONLINE"): number {
  const slotStart = new Date(`${dateStr}T${startTime}:00.000Z`);
  const slotEnd = new Date(`${dateStr}T${endTime}:00.000Z`);
  return commitments.filter((c) => occupies(c, mode) && commitmentsOverlap(slotStart, slotEnd, c.scheduledAt, c.scheduledEndAt)).length;
}

/** Quanti impegni si sovrappongono a un nuovo lavoro di quella modalità; nessuno se il nuovo lavoro dura più giorni. */
export function countOverlapping(commitments: Commitment[], start: Date, end: Date | null | undefined, mode: "HOME" | "ONLINE" | null | undefined): number {
  if (spansMultipleDays(start, end)) return 0;
  return commitments.filter((c) => occupies(c, mode ?? undefined) && commitmentsOverlap(start, end, c.scheduledAt, c.scheduledEndAt)).length;
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Filtro Prisma per prenotazioni e lavori esterni che toccano [from, to), anche iniziati prima (lavori su più giorni). */
export function touchingWindow(from: Date, to: Date) {
  return { scheduledAt: { lt: to }, OR: [{ scheduledAt: { gte: from } }, { scheduledEndAt: { gt: from } }] };
}

/**
 * Quanti lavori di quella modalità il professionista accetta insieme
 * all'ora di inizio: la capienza della fascia dell'agenda in cui cade,
 * altrimenti uno (CLAUDE.md §22).
 */
export async function capacityAt(db: Db, professionalProfileId: string, start: Date, mode: "HOME" | "ONLINE" | null | undefined): Promise<number> {
  const day = new Date(start);
  day.setUTCHours(0, 0, 0, 0);
  const time = start.toISOString().slice(11, 16);
  const slots = await db.availabilitySlot.findMany({
    where: { professionalProfileId, OR: [{ date: day }, { date: null, dayOfWeek: day.getUTCDay() }] },
    select: { dayOfWeek: true, date: true, startTime: true, endTime: true, homeMaxBookings: true, onlineMaxBookings: true },
  });
  const slot = slots.find((s) => slotAppliesOnDate(s, day) && time >= s.startTime && time < s.endTime);
  return (mode === "ONLINE" ? slot?.onlineMaxBookings : slot?.homeMaxBookings) ?? 1;
}

/**
 * Impegni dei professionisti che toccano [from, to), compresi quelli
 * iniziati prima di `from` e non ancora finiti.
 */
export async function loadCommitments(db: Db, professionalProfileIds: string[], from: Date, to: Date): Promise<Map<string, Commitment[]>> {
  const window = touchingWindow(from, to);
  const [bookings, externalJobs] = await Promise.all([
    db.booking.findMany({
      where: { professionalProfileId: { in: professionalProfileIds }, status: { in: [...AGENDA_BOOKING_STATUSES] }, ...window },
      select: { professionalProfileId: true, scheduledAt: true, scheduledEndAt: true, serviceMode: true },
    }),
    db.externalJob.findMany({
      where: { professionalProfileId: { in: professionalProfileIds }, status: { in: [...AGENDA_EXTERNAL_STATUSES] }, ...window },
      select: { professionalProfileId: true, scheduledAt: true, scheduledEndAt: true },
    }),
  ]);
  const result = new Map<string, Commitment[]>();
  const add = (profileId: string, commitment: Commitment) => {
    const list = result.get(profileId) ?? [];
    list.push(commitment);
    result.set(profileId, list);
  };
  for (const booking of bookings) add(booking.professionalProfileId, booking);
  for (const job of externalJobs) add(job.professionalProfileId, { ...job, external: true });
  return result;
}

/**
 * Blocca l'agenda del professionista fino alla fine della transazione: due
 * accettazioni nello stesso istante passano una alla volta, e la seconda
 * vede il lavoro creato dalla prima (D1 e D4 della verifica, §304).
 */
export async function lockProfessionalAgenda(tx: Prisma.TransactionClient, professionalProfileId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agenda:${professionalProfileId}`}))`;
}

/** Messaggio al cliente quando il professionista ha già un impegno a quell'ora. */
export const PROFESSIONAL_BUSY_MESSAGE = "Il professionista non è più libero a quell'ora: scrivigli in chat per scegliere un altro momento.";
