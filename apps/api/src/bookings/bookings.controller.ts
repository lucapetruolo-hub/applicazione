import { BadRequestException, Controller, Body, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import {
  cancelBookingByProfessionalSchema,
  clientConfirmCompleteSchema,
  completeBookingSchema,
  updateBookingMeetingLinkSchema,
  updateBookingNoteSchema,
  type CancelBookingByProfessionalInput,
  type ClientConfirmCompleteInput,
  type CompleteBookingInput,
  type UpdateBookingMeetingLinkInput,
  type UpdateBookingNoteInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { BookingsService } from "./bookings.service";

const updateStatusSchema = z.object({ status: z.enum(["CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"]) });
const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;

@Controller("bookings")
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Foto/video del lavoro terminato, caricate sia dal professionista
   * (`CompleteJobModal`) sia dal cliente (`ClientCompleteModal`) — richiesta
   * esplicita dell'utente. Stesso pattern di `ReviewsController.uploadPhoto`,
   * cartella Cloudinary dedicata invece di riusare quella delle recensioni
   * (sono due gallerie concettualmente diverse: il lavoro svolto vs. il
   * giudizio su come è andata).
   */
  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterExceptionFilter)
  @Post("completion-photos")
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
  async uploadCompletionPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nessuna immagine o video caricato.");
    }
    const imageUrl = await this.cloudinaryService.uploadMedia(file, "booking-completions");
    return { imageUrl };
  }

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

  /**
   * Il cliente conferma dal proprio lato che il lavoro è davvero terminato
   * (richiesta esplicita dell'utente: "servono i completed da entrambi"),
   * con foto facoltative — sblocca la possibilità di scrivere la propria
   * recensione.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(":id/client-confirm-complete")
  clientConfirmComplete(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(clientConfirmCompleteSchema)) body: ClientConfirmCompleteInput,
  ) {
    return this.bookingsService.clientConfirmComplete(req.user.userId, id, body);
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

  /**
   * Il cliente elimina dalla propria lista una prenotazione il cui
   * professionista ha eliminato l'account — richiesta esplicita dell'utente,
   * simmetrica a ProfessionalsService.deleteLead.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  deleteMine(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.bookingsService.deleteForClient(req.user.userId, id);
  }
}
