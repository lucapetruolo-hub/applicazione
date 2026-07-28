import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { waitlistSignupSchema, type WaitlistSignupInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WaitlistService } from "./waitlist.service";

@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  // Unico endpoint pubblico senza autenticazione né account di mezzo (Fase
  // 6/AUDIT.md §6): il bersaglio più esposto per l'email harvesting via bot.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  signup(@Body(new ZodValidationPipe(waitlistSignupSchema)) body: WaitlistSignupInput) {
    // Honeypot: campo invisibile per l'utente reale, se compilato è quasi
    // certamente un bot — risposta identica a un successo vero (nessun
    // indizio al bot che è stato riconosciuto), ma nessuna riga scritta.
    if (body.website) {
      return { ok: true as const };
    }
    return this.waitlistService.signup(body);
  }
}
