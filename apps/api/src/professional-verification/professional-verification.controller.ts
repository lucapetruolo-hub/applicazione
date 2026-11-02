import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  changeProfessionalEntityTypeSchema,
  unverifyProfessionalSchema,
  type ChangeProfessionalEntityTypeInput,
  type UnverifyProfessionalInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { ProfessionalVerificationService } from "./professional-verification.service";

/**
 * Area admin dei professionisti verificati: elenco e "Togli verifica". Il badge
 * lo dà solo la verifica di documento e selfie (docs/CHANGELOG.md §253); la
 * verifica manuale dell'admin (§200) è stata tolta nel §338.
 */
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
  @Post(":id/unverify")
  unverify(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(unverifyProfessionalSchema)) body: UnverifyProfessionalInput) {
    return this.verificationService.unverify(req.user.userId, id, body.note);
  }

  /** "Cambia tipo": privato, con partita IVA o azienda (migliorie del collaudo, gruppo 8). */
  @RequireAdminScope("MODERATION")
  @Post(":id/entity-type")
  changeEntityType(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeProfessionalEntityTypeSchema)) body: ChangeProfessionalEntityTypeInput,
  ) {
    return this.verificationService.changeEntityType(req.user.userId, id, body.entityType, body.note);
  }
}
