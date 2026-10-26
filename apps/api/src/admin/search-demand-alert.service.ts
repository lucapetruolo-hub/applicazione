import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { SEARCH_DEMAND_ALERT_DAYS } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { hasLaunched, launchDate } from "../subscriptions/subscription-rules";
import { searchDemandZones, type SearchDemandZone } from "./professional-stats";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Domanda scoperta (docs/CHANGELOG.md §371, richiesta di Luca): ogni lunedì
 * avvisa i super admin dei lavori e delle città con molte ricerche rimaste
 * senza nessun professionista vicino nell'ultima settimana, per sapere dove
 * reclutare. Nessun avviso se non ce ne sono.
 */
@Injectable()
export class SearchDemandAlertService {
  private readonly logger = new Logger(SearchDemandAlertService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Lunedì alle 9: solo dopo il lancio (`LAUNCH_DATE`), prima le ricerche sono di prova. */
  @Cron("0 9 * * 1", { timeZone: "Europe/Rome" })
  async weeklyCheck(now: Date = new Date()): Promise<SearchDemandZone[] | null> {
    if (!hasLaunched(now, launchDate())) return null;
    const since = new Date(now.getTime() - SEARCH_DEMAND_ALERT_DAYS * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);
    const days = await this.prisma.categorySearchDay.findMany({
      where: { day: { gte: since }, emptyCount: { gt: 0 } },
      select: { city: true, count: true, emptyCount: true, category: { select: { slug: true } } },
    });
    const zones = searchDemandZones(days.map((d) => ({ categorySlug: d.category.slug, city: d.city, count: d.count, emptyCount: d.emptyCount })));
    if (zones.length === 0) return zones;
    this.logger.log(`Ricerche senza professionisti vicino: ${zones.map((z) => `${z.categoryLabel} ${z.city} ${z.empty}`).join(", ")}`);
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER")) {
        await this.notificationsService.notify(admin.id, "ADMIN_SEARCH_DEMAND_ALERT", { zones } as never);
      }
    }
    return zones;
  }
}
