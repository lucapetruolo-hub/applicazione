import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { professionalProfileSelfSchema, type ProfessionalProfileSelfInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ProfessionalsService } from "./professionals.service";

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
  ) {
    return this.professionalsService.search({ category, city, q, remote: remote === "1" || remote === "true" });
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
  @Post("me/image")
  @UseInterceptors(FileInterceptor("image"))
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

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.professionalsService.getById(id);
  }
}
