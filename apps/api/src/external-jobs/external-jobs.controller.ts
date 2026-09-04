import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  externalJobSchema,
  externalJobStatusSchema,
  externalJobUpdateSchema,
  type ExternalJobInput,
  type ExternalJobStatusInput,
  type ExternalJobUpdateInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ExternalJobsService } from "./external-jobs.service";

@Controller("external-jobs")
export class ExternalJobsController {
  constructor(private readonly externalJobsService: ExternalJobsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(externalJobSchema)) body: ExternalJobInput) {
    return this.externalJobsService.create(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.externalJobsService.listMine(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(externalJobUpdateSchema)) body: ExternalJobUpdateInput,
  ) {
    return this.externalJobsService.update(req.user.userId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(externalJobStatusSchema)) body: ExternalJobStatusInput,
  ) {
    return this.externalJobsService.updateStatus(req.user.userId, id, body.status);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.externalJobsService.remove(req.user.userId, id);
  }
}
