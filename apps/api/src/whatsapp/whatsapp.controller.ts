import {
  Body,
  Header,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  whatsappCodeSchema,
  type WhatsAppCodeInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { WhatsAppService } from "./whatsapp.service";

/** Numero confermato e promemoria WhatsApp di chi è entrato (Notifiche). */
@UseGuards(JwtAuthGuard)
@Controller("whatsapp/me")
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get()
  status(@Req() req: AuthenticatedRequest) {
    return this.whatsAppService.status(req.user.userId);
  }

  /** Ogni codice costa e arriva su un telefono: pochi al minuto, oltre ai limiti del servizio. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("code")
  @HttpCode(200)
  sendCode(@Req() req: AuthenticatedRequest) {
    return this.whatsAppService.sendCode(req.user.userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("confirm")
  @HttpCode(200)
  confirm(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(whatsappCodeSchema)) body: WhatsAppCodeInput,
  ) {
    return this.whatsAppService.confirmCode(req.user.userId, body.code);
  }

  @Post("enable")
  @HttpCode(200)
  enable(@Req() req: AuthenticatedRequest) {
    return this.whatsAppService.enable(req.user.userId);
  }

  @Post("disable")
  @HttpCode(200)
  disable(@Req() req: AuthenticatedRequest) {
    return this.whatsAppService.disable(req.user.userId);
  }
}

/** Webhook di Meta: pubblico, firma verificata nel service sul body raw (app-setup.ts). */
@Controller("whatsapp/webhook")
export class WhatsAppWebhookController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  /** Registrazione dell'indirizzo nella console di Meta: risponde con `hub.challenge` in chiaro. */
  @SkipThrottle()
  @Get()
  @Header("Content-Type", "text/plain; charset=utf-8")
  verify(
    @Query("hub.mode") mode: unknown,
    @Query("hub.verify_token") token: unknown,
    @Query("hub.challenge") challenge: unknown,
  ) {
    return this.whatsAppService.verifySubscription(mode, token, challenge);
  }

  @SkipThrottle()
  @Post()
  @HttpCode(200)
  webhook(@Req() req: Request) {
    return this.whatsAppService.handleWebhook(req.body as Buffer, req.headers);
  }
}

/** Admin → WhatsApp: messaggi, costo del mese ed effetto dei promemoria sui lavori saltati. */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/whatsapp")
export class AdminWhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @RequireAdminScope("FINANCE")
  @Get()
  summary(@Query("month") month?: string) {
    return this.whatsAppService.adminSummary(
      typeof month === "string" ? month : undefined,
    );
  }
}
