import { Controller, Body, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  cancelBookingByProfessionalSchema,
  completeBookingSchema,
  updateBookingMeetingLinkSchema,
  updateBookingNoteSchema,
  type CancelBookingByProfessionalInput,
  type CompleteBookingInput,
  type UpdateBookingMeetingLinkInput,
  type UpdateBookingNoteInput,
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

  /** Nota privata del professionista su una prenotazione (mai vista dal cliente), richiesta esplicita dell'utente. */
  @UseGuards(JwtAuthGuard)
  @Patch(":id/note")
  updateNote(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBookingNoteSchema)) body: UpdateBookingNoteInput,
  ) {
    return this.bookingsService.updateProfessionalNote(req.user.userId, id, body.note);
  }

  /** Link per una consulenza video (Meet, Zoom, ecc.) — richiesta esplicita dell'utente, visibile al cliente. */
  @UseGuards(JwtAuthGuard)
  @Patch(":id/meeting-link")
  updateMeetingLink(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBookingMeetingLinkSchema)) body: UpdateBookingMeetingLinkInput,
  ) {
    return this.bookingsService.updateMeetingLink(req.user.userId, id, body.meetingLink);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.bookingsService.listForClient(req.user.userId);
  }

  /** Il cliente segnala che il professionista non si è presentato all'appuntamento e chiede un rimborso. */
  @UseGuards(JwtAuthGuard)
  @Patch(":id/report-no-show")
  reportNoShow(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.bookingsService.reportProfessionalNoShow(req.user.userId, id);
  }
}
