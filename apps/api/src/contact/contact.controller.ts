import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { contactMessageSchema, type ContactMessageInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { assertTurnstile } from "../auth/turnstile";
import { ContactService } from "./contact.service";

@Controller("contact")
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Pubblico, nessun account richiesto (stesso motivo/limite di WaitlistController).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async send(@Body(new ZodValidationPipe(contactMessageSchema)) body: ContactMessageInput, @Req() req: Request) {
    // Honeypot: stesso pattern di WaitlistController — un bot che compila
    // ogni campo riceve una risposta di successo identica, senza scrivere nulla.
    if (body.website) {
      return { ok: true as const };
    }
    await assertTurnstile(body.turnstileToken, req.ip);
    return this.contactService.send(body);
  }
}
