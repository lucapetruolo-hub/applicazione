import { Body, Controller, Get, Put, Query, Req, UseGuards } from "@nestjs/common";
import { saveMonthlyCostsSchema, type SaveMonthlyCostsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "./admin.guard";
import { MonthlyAccountsService } from "./monthly-accounts.service";

/** Admin → Numeri → Conti del mese (docs/changelog/2026-11-25-conti-del-mese.md). */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
@Controller("admin/monthly-accounts")
export class MonthlyAccountsController {
  constructor(private readonly monthlyAccounts: MonthlyAccountsService) {}

  @Get()
  summary(@Query("month") month?: string) {
    return this.monthlyAccounts.summary(month);
  }

  @Put("costs")
  saveCosts(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(saveMonthlyCostsSchema)) body: SaveMonthlyCostsInput) {
    return this.monthlyAccounts.saveCosts(body, req.user.userId);
  }
}
