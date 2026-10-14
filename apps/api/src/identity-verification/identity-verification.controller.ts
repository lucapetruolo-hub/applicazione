import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  declineIdentityVerificationSchema,
  startIdentityVerificationSchema,
  type DeclineIdentityVerificationInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { IdentityVerificationService } from "./identity-verification.service";

/** Verifica fiscale e d'identità del professionista (docs/CHANGELOG.md §243). */
@Controller("professionals/me/verification")
export class IdentityVerificationController {
  constructor(private readonly identityVerificationService: IdentityVerificationService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  status(@Req() req: AuthenticatedRequest) {
    return this.identityVerificationService.myStatus(req.user.userId);
  }

  /** Il consenso al confronto del selfie è obbligatorio: senza, la richiesta non passa. */
  @UseGuards(JwtAuthGuard)
  @Post("identity")
  start(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(startIdentityVerificationSchema)) _body: unknown) {
    return this.identityVerificationService.start(req.user.userId);
  }
}

/** Webhook del fornitore (Didit): pubblico, firma verificata nel service sul body raw (main.ts). */
@Controller("identity-verification")
export class IdentityVerificationWebhookController {
  constructor(private readonly identityVerificationService: IdentityVerificationService) {}

  @SkipThrottle()
  @Post("webhook")
  @HttpCode(200)
  webhook(@Req() req: Request) {
    return this.identityVerificationService.handleWebhook(req.body as Buffer, req.headers);
  }
}

/** Casi dubbi in /admin/verifiche: l'approvazione passa da "Segna come verificato". */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/professional-verifications")
export class AdminIdentityVerificationController {
  constructor(private readonly identityVerificationService: IdentityVerificationService) {}

  @RequireAdminScope("MODERATION")
  @Post(":id/identity-decline")
  decline(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(declineIdentityVerificationSchema)) body: DeclineIdentityVerificationInput) {
    return this.identityVerificationService.declineReview(req.user.userId, id, body.note);
  }
}
