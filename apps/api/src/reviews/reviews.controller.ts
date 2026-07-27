import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { reviewSchema, type ReviewInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ReviewsService } from "./reviews.service";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

@Controller("reviews")
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(reviewSchema)) body: ReviewInput) {
    return this.reviewsService.create(req.user.userId, body);
  }

  // Una chiamata per foto (fino a 3, vedi reviewSchema.photoUrls), stesso
  // pattern di GuidedRequestsController (`POST /guided-requests/photos`):
  // stato di caricamento/errore per singola foto in UI invece di un unico
  // upload multiplo che fallisce o riesce in blocco.
  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterExceptionFilter)
  @Post("photos")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith("image/")) {
          callback(new BadRequestException("Il file caricato deve essere un'immagine."), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nessuna immagine caricata.");
    }
    const imageUrl = await this.cloudinaryService.uploadImage(file, "reviews");
    return { imageUrl };
  }
}
