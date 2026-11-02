import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Req, UseGuards } from "@nestjs/common";
import { setDac7RuleSchema, platformDac7SettingsSchema, type SetDac7RuleInput, type PlatformDac7SettingsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { Dac7Service } from "./dac7.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { pdfResponse, renderDocumentPdf } from "../accounting/document-pdf";
import { dac7PdfModel } from "../accounting/document-pdf-models";

@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
@Controller("admin/dac7")
export class Dac7Controller {
  constructor(
    private readonly dac7Service: Dac7Service,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get("rule")
  getRule() {
    return this.dac7Service.getRule();
  }

  @Post("rule")
  setRule(@Body(new ZodValidationPipe(setDac7RuleSchema)) body: SetDac7RuleInput) {
    return this.dac7Service.setRule(body.includeDirectPayments);
  }

  @Get("settings")
  getSettings() {
    return this.dac7Service.getPlatformSettings();
  }

  @Post("settings")
  setSettings(@Body(new ZodValidationPipe(platformDac7SettingsSchema)) body: PlatformDac7SettingsInput) {
    return this.dac7Service.setPlatformSettings(body);
  }

  @Get("periods")
  listPeriods() {
    return this.dac7Service.listPeriods();
  }

  /** Ricalcola subito il trimestre e l'anno correnti, senza aspettare il cron notturno (utile in admin e per la verifica). */
  @Post("periods/aggregate-now")
  aggregateNow() {
    return this.dac7Service.runDailyAggregation();
  }

  @Get("periods/:id")
  getPeriod(@Param("id") id: string) {
    return this.dac7Service.getPeriodForAdmin(id);
  }

  @Post("periods/:id/export")
  generateExport(@Param("id") id: string) {
    return this.dac7Service.generateExport(id);
  }

  /** Non si annulla: nel registro azioni con chi l'ha fatto (docs/changelog/2026-11-02-admin-protezioni.md). */
  @Post("periods/:id/mark-submitted")
  async markSubmitted(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const updated = await this.dac7Service.markSubmitted(id);
    await this.auditLogService.record({ entityType: "Dac7ReportingPeriod", entityId: id, fieldName: "dac7Submitted", newValue: String(updated.year), changedByUserId: req.user.userId });
    return updated;
  }

  /** Rimanda l'avviso annuale (es. dopo una correzione): normalmente parte da solo con "Segna come inviato". */
  @Post("periods/:id/notify-sellers")
  async notifySellers(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const result = await this.dac7Service.notifySellers(id, { resend: true });
    await this.auditLogService.record({ entityType: "Dac7ReportingPeriod", entityId: id, fieldName: "dac7SellersNotified", newValue: String(result.sent), changedByUserId: req.user.userId });
    return result;
  }

  @Post("periods/:id/correct")
  correctPeriod(@Param("id") id: string) {
    return this.dac7Service.correctPeriod(id);
  }
}

/** Riepilogo DAC7 del professionista (docs/CHANGELOG.md §246): cosa comunichiamo al fisco su di lui. */
@UseGuards(JwtAuthGuard)
@Controller("professionals/me/dac7")
export class ProfessionalDac7Controller {
  constructor(private readonly dac7Service: Dac7Service) {}

  @Get()
  summary(@Req() req: AuthenticatedRequest) {
    return this.dac7Service.summaryForProfessional(req.user.userId);
  }

  /** Il riepilogo di un anno in PDF (docs/CHANGELOG.md §379). */
  @Get(":year/pdf")
  async pdf(@Req() req: AuthenticatedRequest, @Param("year", ParseIntPipe) year: number) {
    const [{ years, maskedIban }, who] = await Promise.all([this.dac7Service.summaryForProfessional(req.user.userId), this.dac7Service.fiscalNameOf(req.user.userId)]);
    const summary = years.find((y) => y.year === year);
    if (!summary) throw new NotFoundException("Nessun compenso in quell'anno.");
    return pdfResponse(await renderDocumentPdf(dac7PdfModel(summary, maskedIban, who)), `riepilogo-dac7-${year}.pdf`);
  }
}
