import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  addStandardServiceSchema,
  mergeServiceNameSchema,
  problemMatchRequestSchema,
  problemTakeoverSchema,
  teachProblemWordSchema,
  type AddStandardServiceInput,
  type MergeServiceNameInput,
  type ProblemMatchRequest,
  type ProblemTakeoverInput,
  type TeachProblemWordInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { ProblemMatchService } from "./problem-match.service";
import { ProblemMatchAdminService } from "./problem-match-admin.service";
import { ProblemTakeoverService } from "./problem-takeover.service";
import { ServiceNamesService } from "./service-names.service";

@Controller("problem-match")
export class ProblemMatchController {
  constructor(
    private readonly problemMatchService: ProblemMatchService,
    private readonly problemTakeoverService: ProblemTakeoverService,
  ) {}

  // Pubblico (il cliente descrive il problema prima di accedere); limite più
  // stretto del globale perché un dubbio costa una chiamata a pagamento.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  match(@Body(new ZodValidationPipe(problemMatchRequestSchema)) body: ProblemMatchRequest) {
    return this.problemMatchService.match(body.description, body.city);
  }

  /** "Prendete in carico la richiesta" (Ce ne occupiamo noi): serve l'accesso. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("takeover")
  takeover(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(problemTakeoverSchema)) body: ProblemTakeoverInput) {
    return this.problemTakeoverService.create(req.user.userId, body);
  }
}

/** Prestazioni standard aggiunte dall'admin (§388): pubbliche, servono all'iscrizione e al profilo. */
@Controller("service-names")
export class ServiceNamesController {
  constructor(private readonly serviceNamesService: ServiceNamesService) {}

  @Get("standard")
  standard() {
    return this.serviceNamesService.standardByCategory();
  }
}

/** "Mestieri richiesti" e "Richieste da seguire" (docs/CHANGELOG.md §392). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/problem-match")
export class AdminProblemMatchController {
  constructor(private readonly adminService: ProblemMatchAdminService) {}

  @RequireAdminScope("MODERATION")
  @Get()
  overview(@Query("filtro") filtro?: string) {
    const filter = filtro === "fuori" || filtro === "ia" || filtro === "nessuno" ? filtro : "tutte";
    return this.adminService.overview(filter);
  }

  @RequireAdminScope("MODERATION")
  @Post("words")
  teach(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(teachProblemWordSchema)) body: TeachProblemWordInput) {
    return this.adminService.teachWord(req.user.userId, body);
  }

  @RequireAdminScope("MODERATION")
  @Delete("words/:id")
  forget(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.forgetWord(req.user.userId, id);
  }

  @RequireAdminScope("MODERATION")
  @Get("service-names")
  serviceNames() {
    return this.adminService.handwrittenServices();
  }

  @RequireAdminScope("MODERATION")
  @Post("service-names/merge")
  merge(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(mergeServiceNameSchema)) body: MergeServiceNameInput) {
    return this.adminService.mergeServiceName(req.user.userId, body);
  }

  @RequireAdminScope("MODERATION")
  @Post("service-names/standard")
  addStandard(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(addStandardServiceSchema)) body: AddStandardServiceInput) {
    return this.adminService.addStandardService(req.user.userId, body);
  }

  @RequireAdminScope("MODERATION")
  @Delete("service-names/standard/:id")
  removeStandard(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.removeStandardService(req.user.userId, id);
  }

  @RequireAdminScope("MODERATION")
  @Delete("service-names/:key")
  unmerge(@Req() req: AuthenticatedRequest, @Param("key") key: string) {
    return this.adminService.removeAlias(req.user.userId, key);
  }

  @RequireAdminScope("MODERATION")
  @Get("takeovers")
  takeovers(@Query("stato") stato?: string) {
    return this.adminService.takeovers(stato === "fatte" ? "DONE" : "OPEN");
  }

  @RequireAdminScope("MODERATION")
  @Post("takeovers/:id/done")
  done(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.markTakeover(req.user.userId, id, "DONE");
  }

  @RequireAdminScope("MODERATION")
  @Post("takeovers/:id/reopen")
  reopen(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.markTakeover(req.user.userId, id, "OPEN");
  }
}
