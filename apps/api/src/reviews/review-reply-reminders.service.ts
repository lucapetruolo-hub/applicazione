import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ScheduledJob } from "../common/scheduled-job";

const DAY_MS = 24 * 60 * 60_000;
/** Dopo quanti giorni senza risposta parte il promemoria. */
export const REVIEW_REPLY_REMINDER_AFTER_DAYS = 3;
/** Le recensioni più vecchie di così non si ricordano più: il promemoria parte solo per quelle recenti. */
const REVIEW_REPLY_REMINDER_MAX_DAYS = 30;
/** Voto massimo che fa partire il promemoria. */
export const REVIEW_REPLY_REMINDER_MAX_RATING = 2;

/**
 * Data da cui contare i 3 giorni: quella della recensione o, se il cliente
 * l'ha aggiornata dopo una segnalazione a lavoro chiuso, quella dell'aggiornamento.
 */
export function reviewReplyReminderFrom(review: { createdAt: Date; updatedAfterIssueAt: Date | null }): Date {
  return review.updatedAfterIssueAt && review.updatedAfterIssueAt > review.createdAt ? review.updatedAfterIssueAt : review.createdAt;
}

/** Va mandato il promemoria per questa recensione? Uno solo per recensione. */
export function reviewReplyReminderDue(
  review: { rating: number; professionalReply: string | null; hiddenAt: Date | null; replyReminderSentAt: Date | null; createdAt: Date; updatedAfterIssueAt: Date | null },
  now: Date,
): boolean {
  if (review.rating > REVIEW_REPLY_REMINDER_MAX_RATING) return false;
  if (review.professionalReply || review.hiddenAt || review.replyReminderSentAt) return false;
  const days = (now.getTime() - reviewReplyReminderFrom(review).getTime()) / DAY_MS;
  return days >= REVIEW_REPLY_REMINDER_AFTER_DAYS && days <= REVIEW_REPLY_REMINDER_MAX_DAYS;
}

/**
 * Promemoria al professionista (sito + email, "Nuove recensioni", spegnibile)
 * per le recensioni da 1 o 2 stelle senza risposta dopo 3 giorni (decisione
 * di Luca del 30/10/2026, docs/changelog/2026-10-30-collaudo-soldi-online.md):
 * un avviso solo per professionista anche con più recensioni, e mai due volte
 * per la stessa recensione.
 */
@Injectable()
export class ReviewReplyRemindersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @ScheduledJob("0 10 * * *", { timeZone: "Europe/Rome" })
  async remindReplies(now: Date = new Date()): Promise<void> {
    const latest = new Date(now.getTime() - REVIEW_REPLY_REMINDER_AFTER_DAYS * DAY_MS);
    const earliest = new Date(now.getTime() - REVIEW_REPLY_REMINDER_MAX_DAYS * DAY_MS);
    const candidates = await this.prisma.review.findMany({
      where: {
        rating: { lte: REVIEW_REPLY_REMINDER_MAX_RATING },
        professionalReply: null,
        hiddenAt: null,
        replyReminderSentAt: null,
        OR: [{ createdAt: { gte: earliest, lte: latest } }, { updatedAfterIssueAt: { gte: earliest, lte: latest } }],
        // Niente avvisi a chi non lavora più sul sito (CLAUDE.md §5 punto 11).
        booking: { professionalProfile: { deletedAt: null, suspendedAt: null, user: { suspendedAt: null } } },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        rating: true,
        professionalReply: true,
        hiddenAt: true,
        replyReminderSentAt: true,
        createdAt: true,
        updatedAfterIssueAt: true,
        booking: { select: { id: true, professionalProfile: { select: { userId: true } } } },
      },
    });
    const byProfessional = new Map<string, typeof candidates>();
    for (const review of candidates) {
      if (!reviewReplyReminderDue(review, now)) continue;
      const userId = review.booking.professionalProfile.userId;
      byProfessional.set(userId, [...(byProfessional.get(userId) ?? []), review]);
    }
    for (const [userId, reviews] of byProfessional) {
      const first = reviews[0];
      if (!first) continue;
      // Segnate prima dell'avviso: se il giro si ripete, nessuno riceve il promemoria due volte.
      const marked = await this.prisma.review.updateMany({
        where: { id: { in: reviews.map((review) => review.id) }, replyReminderSentAt: null, professionalReply: null },
        data: { replyReminderSentAt: now },
      });
      if (marked.count === 0) continue;
      await this.notificationsService.notify(userId, "REVIEW_REPLY_REMINDER", {
        reviewId: first.id,
        bookingId: first.booking.id,
        count: marked.count,
      });
    }
  }
}
