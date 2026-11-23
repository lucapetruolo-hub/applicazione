import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ScheduledJob } from "../common/scheduled-job";

const DAY_MS = 24 * 60 * 60_000;
/** Dopo quanti giorni in controllo si avvisano di nuovo gli admin. */
export const REVIEW_HELD_NOTICE_AFTER_DAYS = 7;

/** È ora del secondo avviso per questa recensione? Uno solo per recensione. */
export function reviewHeldNoticeDue(review: { heldAt: Date | null; heldNoticeSentAt: Date | null }, now: Date): boolean {
  if (!review.heldAt || review.heldNoticeSentAt) return false;
  return now.getTime() - review.heldAt.getTime() >= REVIEW_HELD_NOTICE_AFTER_DAYS * DAY_MS;
}

/**
 * Avviso a tutti gli admin (sito + email): una recensione è in controllo
 * (`late` falso) o ci resta da 7 giorni (`late` vero). Prima compariva solo
 * nella coda "Da fare" (docs/changelog/2026-11-20-recensioni-in-controllo-avvisi.md).
 */
export async function notifyReviewHeldAdmins(
  prisma: PrismaClient,
  notifications: NotificationsService,
  payload: { reviewId: string; clientId: string; late?: boolean },
): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true } });
  for (const admin of admins) await notifications.notify(admin.id, "ADMIN_REVIEW_HELD", payload);
}

/**
 * Recensioni ancora in controllo dopo 7 giorni: lo ricordiamo agli admin, una
 * volta sola per recensione. Al cliente non si scrive (decisione di Luca del
 * 23/11/2026, docs/changelog/2026-11-23-recensioni-in-controllo-solo-admin.md).
 */
@Injectable()
export class ReviewHoldNoticesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @ScheduledJob("20 10 * * *", { timeZone: "Europe/Rome" })
  async noticeLongHeld(now: Date = new Date()): Promise<void> {
    const candidates = await this.prisma.review.findMany({
      where: { heldAt: { not: null, lte: new Date(now.getTime() - REVIEW_HELD_NOTICE_AFTER_DAYS * DAY_MS) }, heldNoticeSentAt: null },
      orderBy: { heldAt: "asc" },
      select: { id: true, heldAt: true, heldNoticeSentAt: true, booking: { select: { clientId: true } } },
    });
    for (const review of candidates) {
      if (!reviewHeldNoticeDue(review, now)) continue;
      // Segnata prima dell'avviso: se il giro si ripete (più copie dell'API), nessuno lo riceve due volte.
      const marked = await this.prisma.review.updateMany({ where: { id: review.id, heldAt: { not: null }, heldNoticeSentAt: null }, data: { heldNoticeSentAt: now } });
      if (marked.count === 0) continue;
      await notifyReviewHeldAdmins(this.prisma, this.notificationsService, { reviewId: review.id, clientId: review.booking.clientId, late: true });
    }
  }
}
