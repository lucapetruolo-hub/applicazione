import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  availabilityExceptionSchema,
  bookAgendaSlotSchema,
  professionalAvailabilitySchema,
  professionalProfileSelfSchema,
  type AvailabilityExceptionInput,
  type BookAgendaSlotInput,
  type ProfessionalAvailabilityInput,
  type ProfessionalProfileSelfInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ProfessionalsService } from "./professionals.service";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

@Controller("professionals")
export class ProfessionalsController {
  constructor(
    private readonly professionalsService: ProfessionalsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get("search")
  search(
    @Query("category") category?: string,
    @Query("city") city?: string,
    @Query("q") q?: string,
    @Query("remote") remote?: string,
    @Query("excludeDemo") excludeDemo?: string,
  ) {
    return this.professionalsService.search({
      category,
      city,
      q,
      remote: remote === "1" || remote === "true",
      excludeDemo: excludeDemo === "1" || excludeDemo === "true",
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getMyProfile(@Req() req: AuthenticatedRequest) {
    return this.professionalsService.getMyProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put("me")
  upsertMyProfile(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(professionalProfileSelfSchema)) body: ProfessionalProfileSelfInput,
  ) {
    return this.professionalsService.upsertMyProfile(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterExceptionFilter)
  @Post("me/image")
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
  async uploadMyImage(@Req() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nessuna immagine caricata.");
    }
    const imageUrl = await this.cloudinaryService.uploadImage(file, "professionisti");
    await this.professionalsService.updateMyImage(req.user.userId, imageUrl);
    return { imageUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/leads")
  getMyLeads(@Req() req: AuthenticatedRequest) {
    return this.professionalsService.getMyLeads(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/bookings")
  getMyBookings(@Req() req: AuthenticatedRequest) {
    return this.professionalsService.getMyBookings(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/availability")
  getMyAvailability(@Req() req: AuthenticatedRequest) {
    return this.professionalsService.getMyAvailability(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put("me/availability")
  upsertMyAvailability(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(professionalAvailabilitySchema)) body: ProfessionalAvailabilityInput,
  ) {
    return this.professionalsService.upsertMyAvailability(req.user.userId, body.slots, body.bookableAgenda);
  }

  @UseGuards(JwtAuthGuard)
  @Post("me/availability/exceptions")
  addAvailabilityException(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(availabilityExceptionSchema)) body: AvailabilityExceptionInput,
  ) {
    return this.professionalsService.addAvailabilityException(req.user.userId, body.date);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("me/availability/exceptions/:date")
  removeAvailabilityException(@Req() req: AuthenticatedRequest, @Param("date") date: string) {
    return this.professionalsService.removeAvailabilityException(req.user.userId, date);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.professionalsService.getById(id);
  }

  @Get(":id/agenda")
  getAgenda(@Param("id") id: string) {
    return this.professionalsService.getPublicAgenda(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/agenda/book")
  bookAgendaSlot(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(bookAgendaSlotSchema)) body: BookAgendaSlotInput,
  ) {
    return this.professionalsService.bookAgendaSlot(req.user.userId, id, body);
  }
}
