import { BadRequestException, Body, Controller, Get, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { reviewSchema, type ReviewInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ReviewsService } from "./reviews.service";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
// Un video pesa naturalmente molto di più di una foto compressa: limite
// più permissivo solo per questo endpoint (richiesta esplicita
// dell'utente: "dai la possibilità di caricare anche i video").
const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;

@Controller("reviews")
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // Pubblico (nessuna guardia): riprova sociale reale per la home, stesso
  // criterio di visibilità delle recensioni sulla pagina profilo pubblica.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("recent")
  getRecent() {
    return this.reviewsService.getRecentPublic();
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(reviewSchema)) body: ReviewInput) {
    return this.reviewsService.create(req.user.userId, body);
  }

  // Una chiamata per foto/video (fino a 5, vedi reviewSchema.photoUrls),
  // stesso pattern di GuidedRequestsController (`POST /guided-requests/photos`):
  // stato di caricamento/errore per singolo elemento in UI invece di un
  // unico upload multiplo che fallisce o riesce in blocco.
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
    const imageUrl = await this.cloudinaryService.uploadMedia(file, "reviews");
    return { imageUrl };
  }
}
