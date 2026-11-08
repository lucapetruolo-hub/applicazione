import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { movePopularJobSchema, popularJobInputSchema, type MovePopularJobInput, type PopularJobInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { PopularJobsService } from "./popular-jobs.service";

/** Pubblico: solo nomi dell'elenco suggerito, nessun conteggio ("Lavori più cercati" in home). */
@Controller("popular-jobs")
export class PopularJobsController {
  constructor(private readonly popularJobsService: PopularJobsService) {}

  @Get()
  list() {
    return this.popularJobsService.publicJobs();
  }
}

/** Admin → Mestieri richiesti → "Lavori più cercati in home". */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/popular-jobs")
export class AdminPopularJobsController {
  constructor(private readonly popularJobsService: PopularJobsService) {}

  @RequireAdminScope("MODERATION")
  @Get()
  view() {
    return this.popularJobsService.adminView();
  }

  @RequireAdminScope("MODERATION")
  @Post()
  add(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(popularJobInputSchema)) body: PopularJobInput) {
    return this.popularJobsService.add(req.user.userId, body);
  }

  @RequireAdminScope("MODERATION")
  @Post("remove")
  @HttpCode(200)
  remove(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(popularJobInputSchema.pick({ service: true }))) body: { service: string }) {
    return this.popularJobsService.remove(req.user.userId, body.service);
  }

  @RequireAdminScope("MODERATION")
  @Post("move")
  @HttpCode(200)
  move(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(movePopularJobSchema)) body: MovePopularJobInput) {
    return this.popularJobsService.move(req.user.userId, body.service, body.direction);
  }
}
