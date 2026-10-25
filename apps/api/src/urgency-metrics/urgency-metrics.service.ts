import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { URGENCY_METRICS_WINDOW_DAYS, type UrgencyMetrics } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { hasLaunched, launchDate } from "../subscriptions/subscription-rules";
import { computeUrgencyMetrics } from "./urgency-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Richieste urgenti dopo il lancio (docs/CHANGELOG.md §340, richiesta di
 * Luca): quota di urgenti, minuti al primo preventivo, urgenti senza
 * destinatari. Ogni lunedì avvisa gli admin se le urgenti superano il 30% o
 * non ricevono risposta prima delle normali.
 */
@Injectable()
export class UrgencyMetricsService {
  private readonly logger = new Logger(UrgencyMetricsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async compute(now: Date = new Date()): Promise<UrgencyMetrics> {
    const since = new Date(now.getTime() - URGENCY_METRICS_WINDOW_DAYS * DAY_MS);
    const requests = await this.prisma.guidedRequest.findMany({
      where: { createdAt: { gte: since, lt: now } },
      select: {
        isUrgent: true,
        createdAt: true,
        _count: { select: { leads: true } },
        quotes: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    return computeUrgencyMetrics(
      requests.map((r) => ({ isUrgent: r.isUrgent, createdAt: r.createdAt, leads: r._count.leads, firstQuoteAt: r.quotes[0]?.createdAt ?? null })),
      since,
      now,
    );
  }

  /** Lunedì alle 9: solo dopo il lancio (`LAUNCH_DATE`), prima i numeri sono di prova. */
  @Cron("0 9 * * 1", { timeZone: "Europe/Rome" })
  async weeklyCheck(now: Date = new Date()): Promise<UrgencyMetrics | null> {
    if (!hasLaunched(now, launchDate())) return null;
    const metrics = await this.compute(now);
    if (metrics.alerts.length === 0) return metrics;
    this.logger.warn(`Richieste urgenti: ${metrics.alerts.join(" ")}`);
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER")) {
        await this.notificationsService.notify(admin.id, "ADMIN_URGENCY_ALERT", metrics as never);
      }
    }
    return metrics;
  }
}
