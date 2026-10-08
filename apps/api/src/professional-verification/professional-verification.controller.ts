import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  unverifyProfessionalSchema,
  verifyProfessionalSchema,
  type UnverifyProfessionalInput,
  type VerifyProfessionalInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { ProfessionalVerificationService } from "./professional-verification.service";

/** Area admin: verifica manuale dei professionisti (docs/CHANGELOG.md §199). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/professional-verifications")
export class AdminProfessionalVerificationController {
  constructor(private readonly verificationService: ProfessionalVerificationService) {}

  @RequireAdminScope("MODERATION")
  @Get()
  list(@Query("stato") stato?: string, @Query("q") q = "") {
    return this.verificationService.list(stato === "verificati" ? "verified" : "pending", q);
  }

  @RequireAdminScope("MODERATION")
  @Post(":id/verify")
  verify(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(verifyProfessionalSchema)) body: VerifyProfessionalInput) {
    return this.verificationService.verify(req.user.userId, id, body.note);
  }

  @RequireAdminScope("MODERATION")
  @Post(":id/unverify")
  unverify(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(unverifyProfessionalSchema)) body: UnverifyProfessionalInput) {
    return this.verificationService.unverify(req.user.userId, id, body.note);
  }
}
