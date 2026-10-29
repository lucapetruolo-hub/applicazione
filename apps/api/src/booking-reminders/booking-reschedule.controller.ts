import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  rejectRescheduleSchema,
  rescheduleBookingSchema,
  type RejectRescheduleInput,
  type RescheduleBookingInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from "../auth/jwt-auth.guard";
import { BookingRescheduleService } from "./booking-reschedule.service";

/** "Non posso più" → un'altra data per l'appuntamento fissato (docs/changelog/2026-10-28-promemoria-whatsapp.md). */
@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class BookingRescheduleController {
  constructor(private readonly rescheduleService: BookingRescheduleService) {}

  /** Il cliente propone un'altra data. */
  @Post(":id/reschedule")
  propose(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rescheduleBookingSchema))
    body: RescheduleBookingInput,
  ) {
    return this.rescheduleService.propose(req.user.userId, id, body);
  }

  /** Il professionista accetta: l'appuntamento si sposta. */
  @Post(":id/reschedule/accept")
  accept(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.rescheduleService.accept(req.user.userId, id);
  }

  /** Il professionista rifiuta: l'appuntamento resta com'era. */
  @Post(":id/reschedule/reject")
  reject(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectRescheduleSchema))
    body: RejectRescheduleInput,
  ) {
    return this.rescheduleService.reject(req.user.userId, id, body);
  }
}
