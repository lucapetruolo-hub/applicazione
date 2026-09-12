import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { setDac7RuleSchema, type SetDac7RuleInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { Dac7Service } from "./dac7.service";

@UseGuards(JwtAuthGuard, AdminGuard)
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
    return this.dac7Service.getPeriod(id);
  }

  @Post("periods/:id/export")
  generateExport(@Param("id") id: string) {
    return this.dac7Service.generateExport(id);
  }

  @Post("periods/:id/mark-submitted")
  markSubmitted(@Param("id") id: string) {
    return this.dac7Service.markSubmitted(id);
  }

  @Post("periods/:id/correct")
  correctPeriod(@Param("id") id: string) {
    return this.dac7Service.correctPeriod(id);
  }
}
