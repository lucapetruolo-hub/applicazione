import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  acceptProfileInviteSchema,
  operatorProfileInviteSchema,
  type AcceptProfileInviteInput,
  type OperatorProfileInviteInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { ProfileInvitesService } from "./profile-invites.service";

/** Area admin: profili creati al telefono (docs/CHANGELOG.md §170). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/professional-invites")
export class AdminProfileInvitesController {
  constructor(private readonly profileInvitesService: ProfileInvitesService) {}

  @RequireAdminScope("MODERATION")
  @Get()
  list() {
    return this.profileInvitesService.listPending();
  }

  @RequireAdminScope("MODERATION")
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(operatorProfileInviteSchema)) body: OperatorProfileInviteInput) {
    return this.profileInvitesService.createByOperator(req.user.userId, body);
  }

  @RequireAdminScope("MODERATION")
  @Post(":userId/link")
  newLink(@Req() req: AuthenticatedRequest, @Param("userId") userId: string) {
    return this.profileInvitesService.newLink(req.user.userId, userId);
  }
}

/** Pagina pubblica `/completa-profilo`: il codice del link è l'unica protezione. */
@Controller("auth/invite")
export class ProfileInvitesController {
  constructor(private readonly profileInvitesService: ProfileInvitesService) {}

  @Get(":token")
  preview(@Param("token") token: string) {
    return this.profileInvitesService.preview(token);
  }

  @Post("accept")
  accept(@Body(new ZodValidationPipe(acceptProfileInviteSchema)) body: AcceptProfileInviteInput) {
    return this.profileInvitesService.accept(body);
  }
}
