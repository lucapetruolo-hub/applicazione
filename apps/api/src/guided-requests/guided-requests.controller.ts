import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { guidedRequestSchema, guidedRequestUpdateSchema, type GuidedRequestInput, type GuidedRequestUpdateInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { GuidedRequestsService } from "./guided-requests.service";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
// Un video pesa naturalmente molto di più di una foto compressa: limite
// più permissivo solo per questo endpoint (richiesta esplicita
// dell'utente: "dai la possibilità di caricare anche i video").
const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;

@Controller("guided-requests")
export class GuidedRequestsController {
  constructor(
    private readonly guidedRequestsService: GuidedRequestsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // Autenticato, ma comunque limitato (Fase 6): ogni richiesta fa fan-out di
  // Lead a più professionisti, un account che ne crea decine al minuto è
  // spam per l'intera piattaforma, non solo per sé stesso.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(guidedRequestSchema)) body: GuidedRequestInput) {
    return this.guidedRequestsService.create(req.user.userId, body);
  }

  // Una chiamata per foto/video (fino a 5, vedi guidedRequestSchema.photoUrls
  // e la UI in GuidedRequestForm): stesso pattern di ProfessionalsController
  // (`POST /professionals/me/image`), così ogni elemento ha il proprio
  // stato di caricamento/errore in UI invece di un unico upload multiplo
  // che fallisce o riesce in blocco. Nome del campo/della risposta
  // ("image"/"imageUrl") invariato per compatibilità con `uploadFile` in
  // api-client (generico, non specifico alle immagini) e con tutti i
  // chiamanti esistenti — accetta anche video.
  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterExceptionFilter)
  @Post("photos")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: MAX_MEDIA_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
          callback(new BadRequestException("Il file caricato deve essere un'immagine o un video."), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nessuna immagine o video caricato.");
    }
    // Stessa trasformazione Cloudinary (resize + compressione automatica)
    // già usata per l'immagine profilo per le foto, compressione "auto" per
    // i video: foto da cellulare possono pesare diversi MB, "ridimensionale
    // per occupare meno memoria" richiesta esplicita dell'utente.
    const imageUrl = await this.cloudinaryService.uploadMedia(file, "guided-requests");
    return { imageUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.guidedRequestsService.listForClient(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(guidedRequestUpdateSchema)) body: GuidedRequestUpdateInput,
  ) {
    return this.guidedRequestsService.update(req.user.userId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  @HttpCode(204)
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.guidedRequestsService.remove(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/status")
  getStatus(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.guidedRequestsService.getStatus(req.user.userId, id);
  }
}
