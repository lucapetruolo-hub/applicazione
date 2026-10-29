import { Body, Controller, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { testAccountUpdateSchema, testTimeShiftSchema, type TestAccountUpdateInput, type TestTimeShiftInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { TestAccountsService } from "./test-accounts.service";
import { TestTimeService } from "./test-time.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminTestAccountsController {
  constructor(
    private readonly testAccountsService: TestAccountsService,
    private readonly testTimeService: TestTimeService,
  ) {}

  /** Segna o toglie "Account di prova" (docs/CHANGELOG.md §395) — solo super admin. */
  @RequireAdminScope("SUPER")
  @Patch("users/:id/test-account")
  setTestAccount(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(testAccountUpdateSchema)) body: TestAccountUpdateInput) {
    return this.testAccountsService.setTestAccount(req.user.userId, id, body.testAccount);
  }

  /** "Fai passare il tempo" sui lavori di un account di prova (docs/changelog/2026-10-29-collaudo-tempo.md) — solo super admin. */
  @RequireAdminScope("SUPER")
  @Post("users/:id/test-time")
  moveTestTime(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(testTimeShiftSchema)) body: TestTimeShiftInput) {
    return this.testTimeService.moveForward(req.user.userId, id, body.days);
  }
}
