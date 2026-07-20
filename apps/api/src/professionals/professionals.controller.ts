import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import { professionalProfileSelfSchema, type ProfessionalProfileSelfInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ProfessionalsService } from "./professionals.service";

@Controller("professionals")
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get("search")
  search(@Query("category") category?: string, @Query("city") city?: string, @Query("q") q?: string) {
    return this.professionalsService.search({ category, city, q });
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
