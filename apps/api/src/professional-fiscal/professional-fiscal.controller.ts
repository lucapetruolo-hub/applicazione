import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  payoutIbanSchema,
  professionalFiscalProfileSchema,
  setFiscalVerificationSchema,
  type PayoutIbanInput,
  type ProfessionalFiscalProfileInput,
  type SetFiscalVerificationInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { ProfessionalFiscalService } from "./professional-fiscal.service";
import { PayoutAccountService } from "./payout-account.service";

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

  @UseGuards(JwtAuthGuard)
  @Post("stripe-dashboard")
  createStripeDashboardLink(@Req() req: AuthenticatedRequest) {
    return this.fiscalService.createStripeDashboardLink(req.user.userId);
  }
}

/** Vista/azioni admin sui dati fiscali di un professionista specifico — CLAUDE.md §88. */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
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

/** IBAN per la DAC7 di chi incassa online (docs/CHANGELOG.md §243). */
@UseGuards(JwtAuthGuard)
@Controller("professionals/me/payout-iban")
export class PayoutIbanController {
  constructor(private readonly payoutAccountService: PayoutAccountService) {}

  @Get()
  getMine(@Req() req: AuthenticatedRequest) {
    return this.payoutAccountService.getMine(req.user.userId);
  }

  @Put()
  saveMine(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(payoutIbanSchema)) body: PayoutIbanInput) {
    return this.payoutAccountService.saveMine(req.user.userId, body);
  }
}
