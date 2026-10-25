import { Prisma, type PrismaClient } from "@professionisti/database";

/**
 * Un solo lavoro non annullato per richiesta (docs/CHANGELOG.md §346). Il
 * controllo nel codice dà il messaggio giusto; l'indice unico parziale
 * "bookings_one_active_job_per_request" lo garantisce anche se un percorso
 * nuovo se ne dimenticasse.
 */
export const OTHER_JOB_INDEX = "bookings_one_active_job_per_request";

/** Le accettazioni sulla stessa richiesta passano una alla volta: la seconda vede il lavoro della prima. */
export async function lockGuidedRequest(tx: Prisma.TransactionClient, guidedRequestId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`request:${guidedRequestId}`}))`;
}

/** La richiesta ha già un lavoro non annullato, escluso `exceptBookingId`. */
export async function hasOtherJob(db: PrismaClient | Prisma.TransactionClient, guidedRequestId: string, exceptBookingId?: string): Promise<boolean> {
  const other = await db.booking.findFirst({
    where: { quote: { guidedRequestId }, status: { not: "CANCELED" }, ...(exceptBookingId ? { id: { not: exceptBookingId } } : {}) },
    select: { id: true },
  });
  return Boolean(other);
}

/** Errore del database per il secondo lavoro sulla stessa richiesta, da trasformare in un 409 leggibile. */
export function isOtherJobViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.includes(OTHER_JOB_INDEX) || text.includes("guidedRequestId");
}

/** Preavviso per annullare del professionista, da copiare sul lavoro che nasce (docs/CHANGELOG.md §347). */
export async function cancellationNoticeFor(db: PrismaClient | Prisma.TransactionClient, professionalProfileId: string): Promise<number | null> {
  const profile = await db.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { cancellationNoticeHours: true } });
  return profile?.cancellationNoticeHours ?? null;
}
