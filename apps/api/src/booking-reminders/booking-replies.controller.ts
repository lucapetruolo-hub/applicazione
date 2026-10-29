import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  appointmentReplySchema,
  type AppointmentReplyInput,
  type AppointmentReplyState,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BookingRepliesService } from "./booking-replies.service";
import { readBookingReplyToken } from "./booking-reply-token";

/**
 * Pulsanti "Ci sarò" e "Non posso più" dell'email del giorno prima, senza
 * accedere: il link porta il lavoro firmato dal server. La risposta si
 * registra solo con il tocco sulla pagina (POST), mai aprendo il link: i
 * filtri antivirus delle caselle aprono i link da soli.
 */
@Controller("booking-replies")
export class BookingRepliesController {
  constructor(private readonly bookingRepliesService: BookingRepliesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":token")
  state(@Param("token") token: string): Promise<AppointmentReplyState> {
    return this.bookingRepliesService.state(this.bookingId(token), new Date());
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":token")
  reply(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(appointmentReplySchema))
    body: AppointmentReplyInput,
  ): Promise<AppointmentReplyState> {
    return this.bookingRepliesService.replyFromEmail(
      this.bookingId(token),
      body.action,
      new Date(),
    );
  }

  private bookingId(token: string): string {
    const bookingId = readBookingReplyToken(token);
    if (!bookingId) throw new NotFoundException("Link non valido.");
    return bookingId;
  }
}
