import { Body, Controller, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { testAccountUpdateSchema, type TestAccountUpdateInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { TestAccountsService } from "./test-accounts.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminTestAccountsController {
  constructor(private readonly testAccountsService: TestAccountsService) {}

  /** Segna o toglie "Account di prova" (docs/CHANGELOG.md §395) — solo super admin. */
  @RequireAdminScope("SUPER")
  @Patch("users/:id/test-account")
  setTestAccount(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(testAccountUpdateSchema)) body: TestAccountUpdateInput) {
    return this.testAccountsService.setTestAccount(req.user.userId, id, body.testAccount);
  }
}
