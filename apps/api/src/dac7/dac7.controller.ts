import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { setDac7RuleSchema, platformDac7SettingsSchema, type SetDac7RuleInput, type PlatformDac7SettingsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { Dac7Service } from "./dac7.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
@Controller("admin/dac7")
export class Dac7Controller {
  constructor(private readonly dac7Service: Dac7Service) {}

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

  @Post("periods/:id/mark-submitted")
  markSubmitted(@Param("id") id: string) {
    return this.dac7Service.markSubmitted(id);
  }

  /** Rimanda l'avviso annuale (es. dopo una correzione): normalmente parte da solo con "Segna come inviato". */
  @Post("periods/:id/notify-sellers")
  notifySellers(@Param("id") id: string) {
    return this.dac7Service.notifySellers(id, { resend: true });
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
}
