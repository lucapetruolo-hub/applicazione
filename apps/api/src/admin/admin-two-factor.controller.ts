import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { adminTwoFactorCodeSchema, type AdminTwoFactorCodeInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "./admin.guard";
import { AdminTwoFactorService } from "./admin-two-factor.service";

/**
 * Verifica in due passaggi dell'area admin (docs/CHANGELOG.md §351). Fuori
 * da AdminGuard tranne l'azzeramento: servono proprio a un admin che non ha
 * ancora dato il codice. Il servizio controlla comunque che sia un admin.
 */
@UseGuards(JwtAuthGuard)
@Controller("admin/2fa")
export class AdminTwoFactorController {
  constructor(private readonly twoFactor: AdminTwoFactorService) {}

  @Get()
  status(@Req() req: AuthenticatedRequest) {
    return this.twoFactor.status(req.user.userId, req.user.adminVerifiedAt);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("setup")
  setup(@Req() req: AuthenticatedRequest) {
    return this.twoFactor.setup(req.user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("enable")
  enable(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(adminTwoFactorCodeSchema)) body: AdminTwoFactorCodeInput) {
    return this.twoFactor.enable(req.user.userId, body.code, req.headers["user-agent"]);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("verify")
  verify(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(adminTwoFactorCodeSchema)) body: AdminTwoFactorCodeInput) {
    return this.twoFactor.verify(req.user.userId, body.code, req.headers["user-agent"]);
  }

  /** Telefono perso: solo un altro super admin, già passato dal codice. */
  @UseGuards(AdminGuard)
  @RequireAdminScope("SUPER")
  @Post("reset/:userId")
  reset(@Req() req: AuthenticatedRequest, @Param("userId") userId: string) {
    return this.twoFactor.reset(req.user.userId, userId);
  }
}
