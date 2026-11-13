import type { ContentReportTargetType, PrismaClient } from "@professionisti/database";

/**
 * Chi ha scritto o possiede il contenuto segnalato: destinatario della
 * motivazione quando una segnalazione è accolta. Usato dalle segnalazioni e
 * dalle proposte dell'IA (docs/changelog/2026-11-13-admin-ia-propone.md).
 */
export async function contentOwnerUserId(prisma: PrismaClient, targetType: ContentReportTargetType, targetId: string): Promise<string | null> {
  if (targetType === "PROFESSIONAL_PROFILE") {
    const profile = await prisma.professionalProfile.findUnique({ where: { id: targetId }, select: { userId: true } });
    return profile?.userId ?? null;
  }
  if (targetType === "REVIEW") {
    const review = await prisma.review.findUnique({ where: { id: targetId }, select: { booking: { select: { clientId: true } } } });
    return review?.booking.clientId ?? null;
  }
  if (targetType === "CHAT_MESSAGE") {
    const event = await prisma.conversationEvent.findUnique({
      where: { id: targetId },
      select: { actor: true, guidedRequest: { select: { clientId: true } }, professionalProfile: { select: { userId: true } } },
    });
    if (!event || event.actor === "SYSTEM") return null;
    return event.actor === "CLIENT" ? event.guidedRequest.clientId : event.professionalProfile.userId;
  }
  const request = await prisma.guidedRequest.findUnique({ where: { id: targetId }, select: { clientId: true } });
  return request?.clientId ?? null;
}

/** Decisioni già prese contro questa persona, non annullate: "Già avvisato N volte" nella scheda del caso. */
export type OwnerHistory = { warnings: number; otherMeasures: number };

export async function ownerHistory(prisma: PrismaClient, ownerUserId: string | null, excludeReportId?: string): Promise<OwnerHistory> {
  if (!ownerUserId) return { warnings: 0, otherMeasures: 0 };
  const rows = await prisma.contentReport.groupBy({
    by: ["action"],
    where: { contentOwnerId: ownerUserId, status: "RESOLVED", revertedAt: null, ...(excludeReportId ? { id: { not: excludeReportId } } : {}) },
    _count: { _all: true },
  });
  let warnings = 0;
  let otherMeasures = 0;
  for (const row of rows) {
    if (row.action === "WARN") warnings += row._count._all;
    else if (row.action) otherMeasures += row._count._all;
  }
  return { warnings, otherMeasures };
}
