import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { BookingsService } from "./bookings.service";

const updateStatusSchema = z.object({ status: z.enum(["CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"]) });

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(JwtAuthGuard)
  @Post("from-quote/:quoteId")
  createFromQuote(@Req() req: AuthenticatedRequest, @Param("quoteId") quoteId: string) {
    return this.bookingsService.createFromQuote(req.user.userId, quoteId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: { status: "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW" },
  ) {
    return this.bookingsService.updateStatus(req.user.userId, id, body.status);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/cancel")
  cancelMine(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.bookingsService.cancelForClient(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.bookingsService.listForClient(req.user.userId);
  }
}
