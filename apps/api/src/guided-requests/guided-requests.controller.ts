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
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import {
  guidedRequestSchema,
  guidedRequestUpdateSchema,
  timelineUpdateSchema,
  type GuidedRequestInput,
  type GuidedRequestUpdateInput,
  type TimelineUpdateInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { TimelineService } from "../timeline/timeline.service";
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
    private readonly timelineService: TimelineService,
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

  // Foto/video allegati a un aggiornamento della cronologia (richiesta
  // esplicita dell'utente) — a differenza di "photos" sopra (solo per la
  // richiesta guidata originale, lato cliente), questo endpoint è usato
  // da ENTRAMBE le parti: nessun controllo di titolarità qui (solo JWT),
  // la verifica "sei tu il cliente o il professionista di questo thread"
  // avviene dopo, al momento di POST :id/timeline con l'URL ottenuto qui.
  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterExceptionFilter)
  @Post("timeline-photos")
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
  async uploadTimelinePhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nessuna immagine o video caricato.");
    }
    const imageUrl = await this.cloudinaryService.uploadMedia(file, "timeline-updates");
    return { imageUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.guidedRequestsService.listForClient(req.user.userId);
  }

  // Inbox "Chat" (richiesta esplicita dell'utente) — elenco di tutti i
  // thread (richiesta guidata + professionista) a cui questo utente
  // partecipa, con solo l'ultimo messaggio come anteprima. Route letterale
  // (non ":id/..."), va dichiarata qui e non rischia comunque conflitti:
  // nessuna rotta ":id" bare in questo controller.
  @UseGuards(JwtAuthGuard)
  @Get("chat-threads")
  listChatThreads(@Req() req: AuthenticatedRequest) {
    return this.timelineService.listThreadsForUser(req.user.userId);
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

  // Cronologia completa cliente↔professionista per questa richiesta
  // (richiesta esplicita dell'utente) — un solo endpoint per entrambi i
  // lati: il service verifica che chi chiama sia il cliente proprietario
  // della richiesta o il professionista del thread indicato, mai un
  // terzo (es. un altro dei professionisti coinvolti nello stesso
  // fan-out). `professionalProfileId` obbligatorio in query: una
  // richiesta guidata può aver raggiunto più professionisti (CLAUDE.md
  // §14), serve sapere quale thread mostrare.
  @UseGuards(JwtAuthGuard)
  @Get(":id/timeline")
  getTimeline(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Query("professionalProfileId") professionalProfileId: string) {
    if (!professionalProfileId) {
      throw new BadRequestException("professionalProfileId è obbligatorio.");
    }
    return this.timelineService.listForUser(req.user.userId, id, professionalProfileId);
  }

  // Aggiornamento scritto a mano (richiesta esplicita dell'utente: "dai la
  // possibilità ad entrambi di inserire foto e video dell'aggiornamento
  // dei lavori") — stesso controllo di accesso di getTimeline sopra,
  // eseguito dentro TimelineService.addUpdate.
  @UseGuards(JwtAuthGuard)
  @Post(":id/timeline")
  addTimelineUpdate(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(timelineUpdateSchema)) body: TimelineUpdateInput,
  ) {
    return this.timelineService.addUpdate(req.user.userId, id, body.professionalProfileId, body.message, body.mediaUrls);
  }
}
