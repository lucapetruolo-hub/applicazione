import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  acceptQuoteSchema,
  cancelBookingByProfessionalSchema,
  completeBookingSchema,
  type AcceptQuoteInput,
  type CancelBookingByProfessionalInput,
  type CompleteBookingInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { BookingsService } from "./bookings.service";

const updateStatusSchema = z.object({ status: z.enum(["CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"]) });

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(JwtAuthGuard)
  @Post("from-quote/:quoteId")
  createFromQuote(
    @Req() req: AuthenticatedRequest,
    @Param("quoteId") quoteId: string,
    @Body(new ZodValidationPipe(acceptQuoteSchema)) body: AcceptQuoteInput,
  ) {
    return this.bookingsService.createFromQuote(req.user.userId, quoteId, body);
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

  /** Il professionista segnala un "Lavoro accettato" come terminato, con l'importo preciso (voci del preventivo + eventuali extra). */
  @UseGuards(JwtAuthGuard)
  @Patch(":id/complete")
  complete(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(completeBookingSchema)) body: CompleteBookingInput) {
    return this.bookingsService.completeWithFinalAmount(req.user.userId, id, body);
  }

  /** Il professionista annulla un intervento già confermato, con una nota facoltativa per il cliente. */
  @UseGuards(JwtAuthGuard)
  @Patch(":id/cancel-by-professional")
  cancelByProfessional(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelBookingByProfessionalSchema)) body: CancelBookingByProfessionalInput,
  ) {
    return this.bookingsService.cancelByProfessional(req.user.userId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.bookingsService.listForClient(req.user.userId);
  }
}
