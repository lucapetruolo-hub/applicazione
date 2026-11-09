import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { CRON_RUNS_KEEP_DAYS, ScheduledJob } from "../common/scheduled-job";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Pulizia delle righe dei giri a orario (`cron_runs`,
 * docs/changelog/2026-11-08-infrastruttura-lancio.md) e chiusura ordinata del
 * collegamento al database quando Render ferma l'API a un deploy.
 */
@Injectable()
export class CronRunsService implements OnModuleDestroy {
  private readonly logger = new Logger(CronRunsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @ScheduledJob("50 3 * * *")
  async deleteOld(now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - CRON_RUNS_KEEP_DAYS * 24 * 60 * 60_000);
    const { count } = await this.prisma.cronRun.deleteMany({ where: { startedAt: { lt: before } } });
    if (count > 0) this.logger.log(`Cancellate ${count} righe dei giri a orario più vecchie di ${CRON_RUNS_KEEP_DAYS} giorni.`);
    return count;
  }

  /** Con `enableShutdownHooks()` (main.ts): le query in corso finiscono, poi si chiude. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
