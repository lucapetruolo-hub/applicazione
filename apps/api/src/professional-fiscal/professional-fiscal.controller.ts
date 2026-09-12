import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { professionalFiscalProfileSchema, setFiscalVerificationSchema, type ProfessionalFiscalProfileInput, type SetFiscalVerificationInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { ProfessionalFiscalService } from "./professional-fiscal.service";

@Controller("professionals/me/fiscal-profile")
export class ProfessionalFiscalController {
  constructor(private readonly fiscalService: ProfessionalFiscalService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getMine(@Req() req: AuthenticatedRequest) {
    return this.fiscalService.getMine(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  upsertMine(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(professionalFiscalProfileSchema)) body: ProfessionalFiscalProfileInput) {
    return this.fiscalService.upsertMine(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("stripe-connect")
  createStripeConnectLink(@Req() req: AuthenticatedRequest) {
    return this.fiscalService.createStripeConnectOnboardingLink(req.user.userId);
  }
}

/** Vista/azioni admin sui dati fiscali di un professionista specifico — CLAUDE.md §88. */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/professionals/:id/fiscal")
export class AdminProfessionalFiscalController {
  constructor(private readonly fiscalService: ProfessionalFiscalService) {}

  @Get()
  get(@Param("id") professionalProfileId: string) {
    return this.fiscalService.getForAdmin(professionalProfileId);
  }

  @Patch("verification")
  setVerification(
    @Req() req: AuthenticatedRequest,
    @Param("id") professionalProfileId: string,
    @Body(new ZodValidationPipe(setFiscalVerificationSchema)) body: SetFiscalVerificationInput,
  ) {
    return this.fiscalService.setVerification(professionalProfileId, body, req.user.userId);
  }
}
