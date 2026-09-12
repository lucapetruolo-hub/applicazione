import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { createFeeRuleSchema, type CreateFeeRuleInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { PlatformFeeRulesService } from "./platform-fee-rules.service";

/** Gestione delle regole di commissione — sempre configurabili da admin, mai hardcoded (CLAUDE.md §88). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/fee-rules")
export class AdminFeeRulesController {
  constructor(private readonly feeRulesService: PlatformFeeRulesService) {}

  @Get()
  list() {
    return this.feeRulesService.listRules();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createFeeRuleSchema)) body: CreateFeeRuleInput) {
    return this.feeRulesService.createRule(body);
  }

  @Patch(":id/close")
  close(@Param("id") id: string) {
    return this.feeRulesService.closeRule(id);
  }
}
