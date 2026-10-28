import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  AdminWhatsAppController,
  WhatsAppController,
  WhatsAppWebhookController,
} from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

/** Promemoria su WhatsApp con Meta (docs/changelog/2026-10-28-promemoria-whatsapp.md). */
@Module({
  imports: [AuthModule],
  controllers: [
    WhatsAppController,
    WhatsAppWebhookController,
    AdminWhatsAppController,
  ],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
