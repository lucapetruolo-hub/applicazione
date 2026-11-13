import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, NotFoundException, Param, Post, Query, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import {
  addProblemExampleSchema,
  addStandardServiceSchema,
  mergeServiceNameSchema,
  problemMatchRequestSchema,
  problemPhotoRequestSchema,
  PROBLEM_PHOTO_MAX_BYTES,
  problemTakeoverSchema,
  teachProblemWordSchema,
  type AddProblemExampleInput,
  type AddStandardServiceInput,
  type MergeServiceNameInput,
  type ProblemMatchRequest,
  type ProblemPhotoRequest,
  type ProblemTakeoverInput,
  type TeachProblemWordInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { clientIp } from "../common/client-ip";
import { assertTurnstile } from "../auth/turnstile";
import { ProblemMatchService, photoMediaType, photoSearchEnabled } from "./problem-match.service";
import { ProblemMatchAdminService } from "./problem-match-admin.service";
import { ProblemExamplesService } from "./problem-examples.service";
import { ProblemTakeoverService } from "./problem-takeover.service";
import { ServiceNamesService } from "./service-names.service";

@Controller("problem-match")
export class ProblemMatchController {
  constructor(
    private readonly problemMatchService: ProblemMatchService,
    private readonly problemTakeoverService: ProblemTakeoverService,
    private readonly problemExamplesService: ProblemExamplesService,
  ) {}

  /** Frasi d'esempio della home, già nell'ordine delle ricerche (docs/changelog/2026-11-03-luci-che-accelerano.md). */
  @Get("examples")
  examples() {
    return this.problemExamplesService.publicExamples();
  }

  // Pubblico (il cliente descrive il problema prima di accedere); limite più
  // stretto del globale perché un dubbio costa una chiamata a pagamento.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  match(@Body(new ZodValidationPipe(problemMatchRequestSchema)) body: ProblemMatchRequest) {
    return this.problemMatchService.match(body.description, body.city, body.chosen, body.photo);
  }

  /** Il sito chiede se mostrare il pulsante della foto. */
  @Get("photo")
  photoStatus() {
    return { enabled: photoSearchEnabled() };
  }

  /**
   * Ricerca con foto (docs/changelog/2026-11-13-ricerca-con-foto.md): la foto
   * arriva già rimpicciolita dal browser, va all'IA e non si salva. Spenta
   * senza PHOTO_SEARCH_ENABLED. Limite stretto: ogni foto è una chiamata a pagamento.
   * Contro chi cambia indirizzo (docs/changelog/2026-11-13-difese-ricerca-con-foto.md):
   * Turnstile, 10 foto al giorno per indirizzo e il tetto delle foto di tutto il sito.
   */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseFilters(MulterExceptionFilter)
  @Post("photo")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: PROBLEM_PHOTO_MAX_BYTES, files: 1 } }))
  async photo(
    @Req() req: Parameters<typeof clientIp>[0],
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(problemPhotoRequestSchema)) body: ProblemPhotoRequest,
  ) {
    if (!photoSearchEnabled()) throw new NotFoundException("La ricerca con foto non è attiva.");
    if (!file) throw new BadRequestException("Nessuna foto caricata.");
    const mediaType = photoMediaType(file.buffer);
    if (!mediaType) throw new BadRequestException("La foto deve essere un'immagine JPEG, PNG o WebP.");
    const ip = clientIp(req);
    await assertTurnstile(body.turnstileToken, ip);
    if (!this.problemMatchService.takePhotoForIp(ip)) {
      throw new HttpException("Per oggi hai già cercato con molte foto: scrivi il problema con parole tue.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.problemMatchService.analyzePhoto(file.buffer, mediaType, body.description);
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
  constructor(
    private readonly adminService: ProblemMatchAdminService,
    private readonly problemExamplesService: ProblemExamplesService,
  ) {}

  @RequireAdminScope("MODERATION")
  @Get("examples")
  examples() {
    return this.problemExamplesService.adminList();
  }

  @RequireAdminScope("MODERATION")
  @Post("examples")
  addExample(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(addProblemExampleSchema)) body: AddProblemExampleInput) {
    return this.problemExamplesService.add(req.user.userId, body.text);
  }

  @RequireAdminScope("MODERATION")
  @Post("examples/remove")
  @HttpCode(200)
  removeExample(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(addProblemExampleSchema)) body: AddProblemExampleInput) {
    return this.problemExamplesService.remove(req.user.userId, body.text);
  }

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
