import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { closeGeneralRequestsSchema, type CloseGeneralRequestsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { GeneralRequestsService } from "./general-requests.service";

/** Pubblico: il modulo di richiesta chiede se le richieste generali sono aperte (docs/CHANGELOG.md §211). */
@Controller("general-requests")
export class GeneralRequestsController {
  constructor(private readonly generalRequestsService: GeneralRequestsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("availability")
  availability(@Query("categoria") categoria?: string, @Query("citta") citta?: string) {
    return this.generalRequestsService.availabilityBySlug(categoria, citta);
  }
}

/** Area admin: carico per zona, chiusura e riapertura a mano. */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/general-requests")
export class AdminGeneralRequestsController {
  constructor(private readonly generalRequestsService: GeneralRequestsService) {}

  @RequireAdminScope("MODERATION")
  @Get()
  overview() {
    return this.generalRequestsService.adminOverview();
  }

  @RequireAdminScope("MODERATION")
  @Post("close")
  close(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(closeGeneralRequestsSchema)) body: CloseGeneralRequestsInput) {
    return this.generalRequestsService.close(req.user.userId, body.categorySlug, body.city);
  }

  @RequireAdminScope("MODERATION")
  @Post(":id/reopen")
  reopen(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.generalRequestsService.reopen(req.user.userId, id);
  }
}
