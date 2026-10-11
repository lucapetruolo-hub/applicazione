import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  DEFAULT_GENERAL_REQUEST_THRESHOLDS,
  GENERAL_REQUESTS_WINDOW_DAYS,
  generalRequestCityKey,
  generalRequestCloseReason,
  responseRate,
  weeklyPerProfessional,
  type GeneralRequestAvailability,
  type GeneralRequestLoad,
  type GeneralRequestThresholds,
  type GeneralRequestsAdminOverview,
  type GeneralRequestZoneRow,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { EmailService } from "../email/email.service";
import { adminGeneralRequestsClosedEmail } from "../email/templates/job-emails";

const DAY_MS = 86_400_000;
const MEASURE_AFTER_MS = 2 * DAY_MS;

/** Interruttore per tutto il sito: spente solo con GENERAL_REQUESTS_ENABLED=false su Render. */
export function generalRequestsGloballyEnabled(): boolean {
  return process.env.GENERAL_REQUESTS_ENABLED?.trim().toLowerCase() !== "false";
}

type ZoneKey = string;
const zoneKey = (categoryId: string, city: string): ZoneKey => `${categoryId}|${city}`;

/**
 * Apertura e chiusura delle richieste generali (docs/CHANGELOG.md §211):
 * per tutto il sito con la variabile d'ambiente, per una categoria in una
 * città con `GeneralRequestBlock` (automatica ogni ora o a mano dall'admin).
 */
@Injectable()
export class GeneralRequestsService {
  private readonly logger = new Logger(GeneralRequestsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  /** Soglie della chiusura automatica (docs/CHANGELOG.md §212): i default finché nessuno le cambia. */
  async thresholds(): Promise<GeneralRequestThresholds> {
    const row = await this.prisma.generalRequestSettings.findFirst();
    if (!row) return { ...DEFAULT_GENERAL_REQUEST_THRESHOLDS };
    return {
      autoCloseEnabled: row.autoCloseEnabled,
      maxWeeklyPerPro: row.maxWeeklyPerPro,
      minResponsePercent: row.minResponsePercent,
      minMeasuredLeads: row.minMeasuredLeads,
      keepOpenDays: row.keepOpenDays,
    };
  }

  async updateThresholds(adminUserId: string, input: GeneralRequestThresholds): Promise<GeneralRequestThresholds> {
    const before = await this.thresholds();
    const existing = await this.prisma.generalRequestSettings.findFirst({ select: { id: true } });
    const data = { ...input, updatedByUserId: adminUserId };
    const saved = existing
      ? await this.prisma.generalRequestSettings.update({ where: { id: existing.id }, data })
      : await this.prisma.generalRequestSettings.create({ data });
    await this.auditLogService.record({
      entityType: "GeneralRequestSettings",
      entityId: saved.id,
      fieldName: "thresholds",
      oldValue: before,
      newValue: input,
      changedByUserId: adminUserId,
    });
    return this.thresholds();
  }

  /** Stato per una categoria in una città (o solo l'interruttore generale, se mancano). */
  async availability(categoryId: string | null, city: string | null): Promise<GeneralRequestAvailability> {
    if (!generalRequestsGloballyEnabled()) return { open: false, closedScope: "GLOBAL" };
    if (!categoryId || !city?.trim()) return { open: true, closedScope: null };
    const block = await this.prisma.generalRequestBlock.findUnique({
      where: { categoryId_city: { categoryId, city: generalRequestCityKey(city) } },
      select: { reopenedAt: true },
    });
    return block && !block.reopenedAt ? { open: false, closedScope: "ZONE" } : { open: true, closedScope: null };
  }

  async availabilityBySlug(categorySlug: string | undefined, city: string | undefined): Promise<GeneralRequestAvailability> {
    const category = categorySlug ? await this.prisma.category.findUnique({ where: { slug: categorySlug }, select: { id: true } }) : null;
    return this.availability(category?.id ?? null, city ?? null);
  }

  /**
   * Carico delle richieste generali per categoria e città negli ultimi
   * GENERAL_REQUESTS_WINDOW_DAYS giorni: quante ne ha ricevute ogni
   * professionista e quante hanno avuto risposta (preventivo o messaggio
   * scritto in chat), contando solo quelle arrivate da almeno 48 ore.
   */
  async computeLoads(now: Date = new Date()): Promise<Map<ZoneKey, { categoryId: string; city: string; load: GeneralRequestLoad }>> {
    const since = new Date(now.getTime() - GENERAL_REQUESTS_WINDOW_DAYS * DAY_MS);
    const leads = await this.prisma.lead.findMany({
      where: { createdAt: { gte: since }, guidedRequest: { professionalProfileId: null } },
      select: { guidedRequestId: true, professionalProfileId: true, createdAt: true, guidedRequest: { select: { categoryId: true, city: true } } },
    });
    const requestIds = [...new Set(leads.map((l) => l.guidedRequestId))];
    const [quotes, messages] =
      requestIds.length > 0
        ? await Promise.all([
            this.prisma.quote.findMany({ where: { guidedRequestId: { in: requestIds } }, select: { guidedRequestId: true, professionalProfileId: true } }),
            this.prisma.conversationEvent.findMany({
              where: { guidedRequestId: { in: requestIds }, actor: "PROFESSIONAL", automatic: false },
              select: { guidedRequestId: true, professionalProfileId: true },
            }),
          ])
        : [[], []];
    const responded = new Set([...quotes, ...messages].map((r) => `${r.guidedRequestId}|${r.professionalProfileId}`));

    const zones = new Map<ZoneKey, { categoryId: string; city: string; load: GeneralRequestLoad; pros: Set<string>; requests: Set<string> }>();
    for (const lead of leads) {
      const city = generalRequestCityKey(lead.guidedRequest.city);
      if (!city) continue;
      const key = zoneKey(lead.guidedRequest.categoryId, city);
      let zone = zones.get(key);
      if (!zone) {
        zone = {
          categoryId: lead.guidedRequest.categoryId,
          city,
          load: { leads: 0, professionals: 0, requests: 0, measuredLeads: 0, respondedLeads: 0 },
          pros: new Set(),
          requests: new Set(),
        };
        zones.set(key, zone);
      }
      zone.load.leads += 1;
      zone.pros.add(lead.professionalProfileId);
      zone.requests.add(lead.guidedRequestId);
      if (now.getTime() - lead.createdAt.getTime() >= MEASURE_AFTER_MS) {
        zone.load.measuredLeads += 1;
        if (responded.has(`${lead.guidedRequestId}|${lead.professionalProfileId}`)) zone.load.respondedLeads += 1;
      }
    }
    const result = new Map<ZoneKey, { categoryId: string; city: string; load: GeneralRequestLoad }>();
    for (const [key, zone] of zones) {
      result.set(key, { categoryId: zone.categoryId, city: zone.city, load: { ...zone.load, professionals: zone.pros.size, requests: zone.requests.size } });
    }
    return result;
  }

  /** Ogni ora: chiude le categorie nelle città dove il carico supera le soglie. Non riapre mai da solo. */
  @Cron(CronExpression.EVERY_HOUR)
  async runAutoCheck(now: Date = new Date()): Promise<number> {
    const thresholds = await this.thresholds();
    if (!thresholds.autoCloseEnabled) return 0;
    const loads = await this.computeLoads(now);
    const blocks = await this.prisma.generalRequestBlock.findMany();
    const blockBy = new Map(blocks.map((b) => [zoneKey(b.categoryId, b.city), b]));
    const closedZones: { categoryId: string; city: string; reason: string }[] = [];
    for (const [key, { categoryId, city, load }] of loads) {
      const reason = generalRequestCloseReason(load, thresholds);
      if (!reason) continue;
      const block = blockBy.get(key);
      if (block && !block.reopenedAt) continue; // già chiusa
      if (block?.keepOpenUntil && block.keepOpenUntil > now) continue; // riaperta a mano di recente
      const saved = await this.prisma.generalRequestBlock.upsert({
        where: { categoryId_city: { categoryId, city } },
        create: { categoryId, city, reason },
        update: { closedAt: now, closedByUserId: null, reason, reopenedAt: null, reopenedByUserId: null, keepOpenUntil: null },
      });
      await this.auditLogService.record({ entityType: "GeneralRequestBlock", entityId: saved.id, fieldName: "status", newValue: "CLOSED", reason });
      closedZones.push({ categoryId, city, reason });
    }
    if (closedZones.length > 0) {
      this.logger.log(`Richieste generali chiuse in automatico in ${closedZones.length} zone.`);
      await this.emailModerators(closedZones);
    }
    return closedZones.length;
  }

  /**
   * Email agli admin di moderazione quando una o più zone si chiudono da
   * sole (docs/CHANGELOG.md §212), così nessuno deve controllare la pagina.
   * Un errore d'invio non annulla la chiusura.
   */
  private async emailModerators(zones: { categoryId: string; city: string; reason: string }[]): Promise<void> {
    try {
      const [admins, categories] = await Promise.all([
        this.prisma.user.findMany({
          where: { role: "ADMIN", deletedAt: null, suspendedAt: null, OR: [{ adminRoles: { isEmpty: true } }, { adminRoles: { hasSome: ["SUPER", "MODERATOR"] } }] },
          select: { email: true },
        }),
        this.prisma.category.findMany({ where: { id: { in: [...new Set(zones.map((z) => z.categoryId))] } }, select: { id: true, label: true } }),
      ]);
      const labelBy = new Map(categories.map((c) => [c.id, c.label]));
      const email = adminGeneralRequestsClosedEmail(zones.map((z) => ({ category: labelBy.get(z.categoryId) ?? "Categoria", city: z.city, reason: z.reason })));
      await Promise.all(admins.flatMap((admin) => (admin.email ? [this.emailService.send({ to: admin.email, ...email })] : [])));
    } catch (err) {
      this.logger.error(`Email admin zone chiuse non inviata: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Pagina admin: carico di ogni zona attiva o chiusa, le chiuse per prime. */
  async adminOverview(): Promise<GeneralRequestsAdminOverview> {
    const [loads, blocks, categories, thresholds] = await Promise.all([
      this.computeLoads(),
      this.prisma.generalRequestBlock.findMany(),
      this.prisma.category.findMany({ select: { id: true, slug: true, label: true } }),
      this.thresholds(),
    ]);
    const categoryBy = new Map(categories.map((c) => [c.id, c]));
    const keys = new Set([...loads.keys(), ...blocks.map((b) => zoneKey(b.categoryId, b.city))]);
    const blockBy = new Map(blocks.map((b) => [zoneKey(b.categoryId, b.city), b]));
    const empty: GeneralRequestLoad = { leads: 0, professionals: 0, requests: 0, measuredLeads: 0, respondedLeads: 0 };
    const now = new Date();
    const rows: GeneralRequestZoneRow[] = [];
    for (const key of keys) {
      const zone = loads.get(key);
      const block = blockBy.get(key);
      const categoryId = zone?.categoryId ?? block!.categoryId;
      const category = categoryBy.get(categoryId);
      if (!category) continue;
      const load = zone?.load ?? empty;
      rows.push({
        categorySlug: category.slug as ProfessionalCategorySlug,
        categoryLabel: category.label,
        city: zone?.city ?? block!.city,
        load,
        weeklyPerProfessional: weeklyPerProfessional(load),
        responseRate: responseRate(load, thresholds.minMeasuredLeads),
        block:
          block && !block.reopenedAt
            ? { id: block.id, closedAt: block.closedAt.toISOString(), automatic: block.closedByUserId === null, reason: block.reason }
            : null,
        keepOpenUntil: block?.reopenedAt && block.keepOpenUntil && block.keepOpenUntil > now ? block.keepOpenUntil.toISOString() : null,
      });
    }
    rows.sort((a, b) => Number(Boolean(b.block)) - Number(Boolean(a.block)) || b.weeklyPerProfessional - a.weeklyPerProfessional);
    return { globallyEnabled: generalRequestsGloballyEnabled(), thresholds, rows };
  }

  async close(adminUserId: string, categorySlug: string, rawCity: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { slug: categorySlug }, select: { id: true } });
    if (!category) throw new NotFoundException("Categoria non trovata.");
    const city = generalRequestCityKey(rawCity);
    const reason = "Chiusa a mano dall'area admin.";
    const saved = await this.prisma.generalRequestBlock.upsert({
      where: { categoryId_city: { categoryId: category.id, city } },
      create: { categoryId: category.id, city, reason, closedByUserId: adminUserId },
      update: { closedAt: new Date(), closedByUserId: adminUserId, reason, reopenedAt: null, reopenedByUserId: null, keepOpenUntil: null },
    });
    await this.auditLogService.record({ entityType: "GeneralRequestBlock", entityId: saved.id, fieldName: "status", newValue: "CLOSED", changedByUserId: adminUserId, reason });
  }

  async reopen(adminUserId: string, blockId: string): Promise<void> {
    const block = await this.prisma.generalRequestBlock.findUnique({ where: { id: blockId } });
    if (!block) throw new NotFoundException("Chiusura non trovata.");
    const now = new Date();
    const { keepOpenDays } = await this.thresholds();
    await this.prisma.generalRequestBlock.update({
      where: { id: blockId },
      data: { reopenedAt: now, reopenedByUserId: adminUserId, keepOpenUntil: new Date(now.getTime() + keepOpenDays * DAY_MS) },
    });
    await this.auditLogService.record({ entityType: "GeneralRequestBlock", entityId: blockId, fieldName: "status", newValue: "OPEN", changedByUserId: adminUserId });
  }
}
