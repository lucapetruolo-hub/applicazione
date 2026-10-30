import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { TERMS_CHANGES, termsChangeToAnnounce, type TermsChange } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

/** Account per giro: con la pausa tra uno e l'altro un giro dura circa 3 minuti. */
const BATCH = 300;
/** Pausa tra due invii: Resend accetta poche email al secondo. */
const PAUSE_MS = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Avviso del cambio dei Termini a tutti gli account, sul sito e per email,
 * una volta per versione (punto 12 dei Termini, Reg. UE 2019/1150 art. 3;
 * collaudo del 29/10/2026, M-04; docs/changelog/2026-10-30-termini-privacy-obblighi.md).
 * La versione da annunciare la decide `TERMS_CHANGES`; ogni 10 minuti si
 * manda un blocco di account e si segna l'ultimo, così un riavvio riparte
 * da lì. Tipo "Account e sicurezza": non si spegne.
 */
@Injectable()
export class TermsNoticeService {
  private readonly logger = new Logger(TermsNoticeService.name);
  private running = false;
  /** Zero nei test. */
  pauseMs = PAUSE_MS;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run(now: Date = new Date(), changes: readonly TermsChange[] = TERMS_CHANGES): Promise<number> {
    const change = termsChangeToAnnounce(now.toISOString().slice(0, 10), changes);
    if (!change || this.running) return 0;
    this.running = true;
    try {
      const notice = await this.prisma.termsChangeNotice.upsert({ where: { version: change.version }, create: { version: change.version }, update: {} });
      if (notice.finishedAt) return 0;
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null, ...(notice.lastUserId ? { id: { gt: notice.lastUserId } } : {}) },
        select: { id: true },
        orderBy: { id: "asc" },
        take: BATCH,
      });
      let sent = 0;
      for (const user of users) {
        await this.notificationsService.notify(user.id, "TERMS_CHANGED", { version: change.version });
        sent += 1;
        if (this.pauseMs > 0) await sleep(this.pauseMs);
      }
      await this.prisma.termsChangeNotice.update({
        where: { version: change.version },
        data: {
          sentCount: { increment: sent },
          ...(users.length > 0 ? { lastUserId: users[users.length - 1]!.id } : {}),
          ...(users.length < BATCH ? { finishedAt: now } : {}),
        },
      });
      if (sent > 0) this.logger.log(`Avviso Termini ${change.version}: ${sent} account in questo giro.`);
      return sent;
    } finally {
      this.running = false;
    }
  }
}
