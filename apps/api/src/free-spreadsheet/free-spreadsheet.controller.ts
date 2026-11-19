import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { freeSpreadsheetConfirmSchema, freeSpreadsheetSignupSchema, type FreeSpreadsheetSignupInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { assertTurnstile } from "../auth/turnstile";
import { clientIp } from "../common/client-ip";
import { FreeSpreadsheetService } from "./free-spreadsheet.service";

/** Excel gratuito "Entrate e uscite" (docs/changelog/2026-11-19-entrate-e-uscite.md). Pubblico, senza account. */
@Controller("free-spreadsheet")
export class FreeSpreadsheetController {
  constructor(private readonly freeSpreadsheetService: FreeSpreadsheetService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async signup(@Body(new ZodValidationPipe(freeSpreadsheetSignupSchema)) body: FreeSpreadsheetSignupInput, @Req() req: Request) {
    await assertTurnstile(body.turnstileToken, clientIp(req));
    return this.freeSpreadsheetService.signup(body);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("confirm")
  confirm(@Body(new ZodValidationPipe(freeSpreadsheetConfirmSchema)) body: { token: string }) {
    return this.freeSpreadsheetService.confirm(body.token);
  }
}
