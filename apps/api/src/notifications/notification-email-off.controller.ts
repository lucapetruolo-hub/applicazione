import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

const emailOffSchema = z.object({ token: z.string().min(10).max(400), off: z.boolean().optional() });

/**
 * "Non ricevere più email come questa" dal link in fondo alle email
 * (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md): senza
 * accedere, il link firmato basta. Senza `off` dice solo di cosa si tratta e
 * com'è adesso (la pagina lo mostra prima del tocco), `off: false` riaccende.
 */
@Controller("notifications/email-off")
export class NotificationEmailOffController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  emailOff(@Body(new ZodValidationPipe(emailOffSchema)) body: z.infer<typeof emailOffSchema>) {
    return this.notificationsService.setEmailOffFromLink(body.token, body.off);
  }
}
