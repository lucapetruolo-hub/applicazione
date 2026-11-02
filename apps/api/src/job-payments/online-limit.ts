import type { PrismaClient } from "@professionisti/database";
import { onlineLimitEurCents } from "@professionisti/shared";

export type ProfessionalOnlineLimit = { limitEurCents: number | null; cleanJobs: number; firstCleanJobAt: Date | null; removedAt: Date | null };

type LimitPayment = {
  releasedAt: Date | null;
  depositPaidAt: Date | null;
  createdAt: Date;
  stripeDisputeId: string | null;
  stripeDisputeStatus: string | null;
  stripeDisputedAt: Date | null;
  status: string;
};

/**
 * Lavori che contano per togliere il tetto: pagati online, con i soldi già
 * passati al professionista, senza contestazioni in banca e pagati dopo
 * l'ultima contestazione persa (docs/changelog/2026-10-28-tetto-pagamenti-online.md).
 */
export function cleanOnlineJobs(payments: LimitPayment[]): { cleanJobs: number; firstCleanJobAt: Date | null } {
  const lastLostAt = payments
    .filter((p) => p.stripeDisputeStatus === "lost")
    .reduce<number>((latest, p) => Math.max(latest, (p.stripeDisputedAt ?? p.createdAt).getTime()), 0);
  const paidAt = payments
    .filter((p) => p.releasedAt && !p.stripeDisputeId && p.status !== "REFUNDED")
    .map((p) => (p.depositPaidAt ?? p.createdAt).getTime())
    .filter((at) => at > lastLostAt);
  return { cleanJobs: paidAt.length, firstCleanJobAt: paidAt.length ? new Date(Math.min(...paidAt)) : null };
}

const LIMIT_PAYMENT_SELECT = {
  releasedAt: true,
  depositPaidAt: true,
  createdAt: true,
  stripeDisputeId: true,
  stripeDisputeStatus: true,
  stripeDisputedAt: true,
  status: true,
} as const;

/** Tetto ai pagamenti online di un professionista (null = nessun tetto). */
export async function professionalOnlineLimit(prisma: PrismaClient, professionalProfileId: string, now = new Date()): Promise<ProfessionalOnlineLimit> {
  const [profile, payments] = await Promise.all([
    prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { onlineLimitRemovedAt: true } }),
    prisma.jobPayment.findMany({
      where: { paymentMethod: "MANOVIA", booking: { professionalProfileId }, OR: [{ releasedAt: { not: null } }, { stripeDisputeStatus: "lost" }] },
      select: LIMIT_PAYMENT_SELECT,
    }),
  ]);
  const removedAt = profile?.onlineLimitRemovedAt ?? null;
  const clean = cleanOnlineJobs(payments);
  return { ...clean, removedAt, limitEurCents: onlineLimitEurCents({ ...clean, removedByAdmin: !!removedAt, now }) };
}

/** Soldi online pagati al professionista e non ancora sbloccati (collaudo P-02). */
export async function professionalHeldEurCents(prisma: PrismaClient, professionalProfileId: string): Promise<number> {
  const rows = await prisma.jobPayment.findMany({
    where: { paymentMethod: "MANOVIA", booking: { professionalProfileId }, releasedAt: null, paidEurCents: { gt: 0 } },
    select: { paidEurCents: true, refundedEurCents: true },
  });
  return rows.reduce((sum, row) => sum + Math.max(0, row.paidEurCents - row.refundedEurCents), 0);
}

/** Campi del tetto nel profilo del professionista (MyProfessionalProfile). */
export function onlineLimitFields(limit: ProfessionalOnlineLimit) {
  return {
    onlineLimitEurCents: limit.limitEurCents,
    onlineLimitProgress: { cleanJobs: limit.cleanJobs, firstCleanJobAt: limit.firstCleanJobAt?.toISOString() ?? null },
  };
}
